import json
from types import SimpleNamespace
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from api.core import knowledge_base
from api.core.ai import generate_agent_reply
from api.core.models import UserRole


class ClinicalKnowledgeBaseTests(SimpleTestCase):
    def setUp(self):
        self.temp_directory = TemporaryDirectory()
        self.addCleanup(self.temp_directory.cleanup)
        path = Path(self.temp_directory.name) / "chunks.json"
        path.write_text(json.dumps({
            "chunks": [
                {
                    "id": "acl-p1",
                    "title": "ACL reconstruction protocol",
                    "url": "https://approved.example/acl.pdf",
                    "page": 1,
                    "text": "Progression requires full knee extension and quadriceps control.",
                },
                {
                    "id": "shoulder-p1",
                    "title": "Rotator cuff repair protocol",
                    "url": "https://approved.example/shoulder.pdf",
                    "page": 2,
                    "text": "Protect the repair during the early postoperative phase.",
                },
            ],
        }), encoding="utf-8")
        self.path_patch = patch.object(knowledge_base, "KNOWLEDGE_BASE_PATH", path)
        self.path_patch.start()
        self.addCleanup(self.path_patch.stop)
        knowledge_base.load_chunks.cache_clear()
        self.addCleanup(knowledge_base.load_chunks.cache_clear)

    def test_recognises_noisy_technical_question(self):
        self.assertTrue(knowledge_base.is_technical_question(
            "what r the progression criteria for acl rehab?"
        ))
        self.assertFalse(knowledge_base.is_technical_question("my patients"))

    def test_retrieval_selects_relevant_approved_protocol(self):
        results = knowledge_base.retrieve_knowledge(
            "What are the ACL progression criteria?"
        )

        self.assertEqual(results[0]["id"], "acl-p1")

    def test_context_requires_inline_citations_and_source_links(self):
        context, sources = knowledge_base.knowledge_context(
            "What are the ACL progression criteria?"
        )

        self.assertIn("[KB1]", context)
        self.assertIn("use only these passages", context)
        self.assertEqual(sources[0]["url"], "https://approved.example/acl.pdf")

    def test_unsupported_question_forbids_general_model_guess(self):
        context, sources = knowledge_base.knowledge_context(
            "What does an elbow rehabilitation protocol recommend?"
        )

        self.assertIn("does not currently support a grounded answer", context)
        self.assertEqual(sources, [])

    @override_settings(GEMINI_API_KEY="test-key", GEMINI_MODEL="test-model")
    @patch("api.core.ai.knowledge_context")
    @patch("google.genai.Client")
    def test_clinician_technical_answer_receives_grounding_and_history(
        self, client_class, build_context,
    ):
        build_context.return_value = (
            "Approved passage [KB1] with citation instructions.", []
        )
        interaction = Mock(output_text="Grounded answer [KB1]")
        client_class.return_value.interactions.create.return_value = interaction
        user = SimpleNamespace(role=UserRole.CLINICIAN)

        answer = generate_agent_reply(
            user,
            "What about phase two?",
            history=[{
                "role": "user",
                "content": "Explain ACL reconstruction progression.",
            }],
        )

        self.assertEqual(answer, "Grounded answer [KB1]")
        build_context.assert_called_once_with(
            "Explain ACL reconstruction progression.\nWhat about phase two?"
        )
        call = client_class.return_value.interactions.create.call_args.kwargs
        self.assertIn("Approved passage [KB1]", call["system_instruction"])

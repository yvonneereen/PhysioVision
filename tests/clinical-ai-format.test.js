import assert from "node:assert/strict";
import { formatClinicalAssistantText } from "../clinical-ai-format.js";

const flattenedPlan = "Here is a draft plan for **Rosanne Lee**. *Note: Clinical review is required.* --- ### **Draft Exercise Plan** **Patient:** Rosanne Lee **Focus:** Hip and quadriceps strengthening --- #### **Phase 1: Pain Control** *Goal: Improve control safely.* 1. **Quadriceps Isometric Sets** * **Focus:** Quadriceps activation * **Dosage:** 2–3 sets of 10–12 repetitions 2. **Side-Lying Clamshells** * **Frequency:** 3 times per week";
const formatted = formatClinicalAssistantText(flattenedPlan);

assert.match(formatted, /<article class="clinical-ai-richtext">/);
assert.match(formatted, /<h3><strong>Draft Exercise Plan<\/strong><\/h3>/);
assert.match(formatted, /<h4><strong>Phase 1: Pain Control<\/strong><\/h4>/);
assert.match(formatted, /<dl class="clinical-ai-facts">[\s\S]*?<dt>Patient<\/dt>[\s\S]*?<dd>Rosanne Lee<\/dd>/);
assert.match(formatted, /<ol class="clinical-ai-exercise-list">/);
assert.match(formatted, /clinical-ai-exercise-title[\s\S]*?<strong>Quadriceps Isometric Sets<\/strong>/);
assert.match(formatted, /clinical-ai-detail-list[\s\S]*?<strong>Dosage:<\/strong> 2–3 sets/);
assert.doesNotMatch(formatted, /###|---|\*\*/);

const unsafe = formatClinicalAssistantText("**Result:** <img src=x onerror=alert(1)>");
assert.doesNotMatch(unsafe, /<img/);
assert.match(unsafe, /&lt;img src=x onerror=alert\(1\)&gt;/);

const shortReply = formatClinicalAssistantText("The draft is ready for your review.");
assert.equal(shortReply, "<p>The draft is ready for your review.</p>");

console.log("clinical AI response formatting tests passed");

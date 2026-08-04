import time

from django.core.management.base import BaseCommand

from api.core.emergency_alerts import process_due_emergency_alerts


class Command(BaseCommand):
    help = "Process due fall alerts and notify verified emergency contacts."

    def add_arguments(self, parser):
        parser.add_argument(
            "--watch",
            action="store_true",
            help="Keep polling for due alerts instead of running once.",
        )
        parser.add_argument(
            "--interval",
            type=float,
            default=2.0,
            help="Seconds between polls in watch mode (default: 2).",
        )

    def handle(self, *args, **options):
        interval = max(0.5, min(options["interval"], 60.0))
        while True:
            processed = process_due_emergency_alerts()
            if processed:
                self.stdout.write(
                    f"Processed {len(processed)} emergency alert(s)."
                )
            if not options["watch"]:
                return
            time.sleep(interval)

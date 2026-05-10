from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db.models import FileField


class Command(BaseCommand):
    help = "Create configured media upload directories and verify they are writable."

    def add_arguments(self, parser):
        parser.add_argument(
            "--mode",
            default="775",
            help="Octal permissions to use when creating missing directories. Defaults to 775.",
        )
        parser.add_argument(
            "--skip-write-test",
            action="store_true",
            help="Only create directories; do not write a temporary file to verify access.",
        )

    def handle(self, *args, **options):
        media_root = Path(settings.MEDIA_ROOT)
        try:
            mode = int(str(options["mode"]), 8)
        except ValueError as exc:
            raise CommandError("--mode must be an octal value such as 775 or 755.") from exc

        directories = self._upload_directories(media_root)
        for directory in sorted(directories):
            self._ensure_directory(directory, mode)
            if not options["skip_write_test"]:
                self._verify_writable(directory)

        self.stdout.write(self.style.SUCCESS(f"Verified {len(directories)} media directories under {media_root}."))

    def _upload_directories(self, media_root: Path) -> set[Path]:
        directories = {media_root}
        for model in apps.get_models():
            for field in model._meta.fields:
                if not isinstance(field, FileField):
                    continue
                upload_to = field.upload_to
                if isinstance(upload_to, str) and upload_to:
                    directories.add(media_root / upload_to)
        return directories

    def _ensure_directory(self, directory: Path, mode: int) -> None:
        try:
            directory.mkdir(mode=mode, parents=True, exist_ok=True)
        except PermissionError as exc:
            raise CommandError(self._permission_message(directory)) from exc

    def _verify_writable(self, directory: Path) -> None:
        probe = directory / ".write-test"
        try:
            with probe.open("w", encoding="utf-8") as handle:
                handle.write("ok")
        except PermissionError as exc:
            raise CommandError(self._permission_message(directory)) from exc
        finally:
            try:
                probe.unlink()
            except FileNotFoundError:
                pass

    def _permission_message(self, directory: Path) -> str:
        return (
            f"Cannot write to {directory}. Fix ownership/permissions for the user running Django, for example:\n"
            f"  sudo mkdir -p {directory}\n"
            f"  sudo chown -R <gunicorn-user>:<gunicorn-group> {settings.MEDIA_ROOT}\n"
            f"  sudo chmod -R u+rwX,g+rwX {settings.MEDIA_ROOT}"
        )

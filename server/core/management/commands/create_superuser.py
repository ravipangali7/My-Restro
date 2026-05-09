from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create or update a superuser for MyRestro."

    def add_arguments(self, parser):
        parser.add_argument("--phone", required=True, help="Superuser phone number.")
        parser.add_argument("--password", required=True, help="Superuser password.")
        parser.add_argument("--name", default="Super Admin", help="Superuser display name.")

    def handle(self, *args, **options):
        phone = options["phone"]
        password = options["password"]
        name = options["name"]
        user_model = get_user_model()

        if not password or len(password) < 8:
            raise CommandError("Password must be at least 8 characters long.")

        user, created = user_model.objects.get_or_create(phone=phone, defaults={"name": name})
        user.name = name or user.name
        user.role = "super_admin"
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()

        if created:
            self.stdout.write(self.style.SUCCESS(f"Superuser created for phone {phone}."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Existing user {phone} promoted to superuser."))

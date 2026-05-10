# Deploy Notes

## Phone login (Twilio OTP)

Customer and staff login sends a one-time code by SMS through Twilio. On the machine that runs Django, set:

| Variable | Purpose |
|----------|---------|
| `TWILIO_ACCOUNT_SID` | From the [Twilio Console](https://www.twilio.com/console) |
| `TWILIO_AUTH_TOKEN` | Auth token for that account |
| `TWILIO_FROM_NUMBER` | Your Twilio phone number in E.164, e.g. `+15551234567`, **or** use a Messaging Service instead (below) |
| `TWILIO_MESSAGING_SERVICE_SID` | Optional. If set, Twilio sends through this Messaging Service and `TWILIO_FROM_NUMBER` is not required for the REST call |

Restart Gunicorn after changing environment variables.

**Trial accounts:** Twilio only delivers to [verified caller IDs](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account) until you upgrade.

**Local development without SMS:** set `DJANGO_DEBUG=true` so a failed or skipped SMS still returns HTTP 201 with `debug_otp` in the JSON (the web login page shows it). Do not use `DJANGO_DEBUG=true` on a public production server.

**Private staging without Twilio:** you may set `SMS_OTP_ALLOW_INSECURE_FALLBACK=true` so OTPs are returned in the API like debug mode while `DJANGO_DEBUG` stays off. This exposes codes to anyone who can request an OTP; use only on a locked-down staging host, never on production.

## Media Upload Permissions

Django stores uploaded images under `server/media`. The user that runs Gunicorn must be able to create subdirectories and files there.

On the server, verify the Gunicorn user and repair the media directory ownership:

```bash
ps -o user,group,cmd -C gunicorn
sudo mkdir -p /home/infelo/app/My-Restro/server/media/users
sudo chown -R infelo:infelo /home/infelo/app/My-Restro/server/media
sudo chmod -R u+rwX,g+rwX /home/infelo/app/My-Restro/server/media
```

If Gunicorn runs as a different user/group, replace `infelo:infelo` with that user/group.

After deploying, run:

```bash
cd /home/infelo/app/My-Restro/server
source env/bin/activate
python manage.py ensure_media_dirs
sudo systemctl restart gunicorn
```

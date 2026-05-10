# Deploy Notes

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

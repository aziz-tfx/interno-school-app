# Servers installed before TimeoutStartSec was added: give the unit a limit,
# so one hung run can't stop the 2-minute checks again.
mkdir -p /etc/systemd/system/interno-autodeploy.service.d
printf '[Service]\nTimeoutStartSec=45min\n' > /etc/systemd/system/interno-autodeploy.service.d/timeout.conf
systemctl daemon-reload

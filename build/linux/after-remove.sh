#!/bin/bash
# Mesma etapa do script padrão do electron-builder (que este substitui) e a regra udev.
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove 'mouse-profile-manager' '/usr/bin/mouse-profile-manager'
else
    rm -f '/usr/bin/mouse-profile-manager'
fi
rm -f /etc/udev/rules.d/70-mouse-profile-manager.rules
udevadm control --reload-rules || true

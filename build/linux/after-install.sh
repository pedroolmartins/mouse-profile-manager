#!/bin/bash
# Mesmas etapas do script padrão do electron-builder (que este substitui): comando
# no PATH, sandbox do Chromium e atalhos no menu.
if type update-alternatives >/dev/null 2>&1; then
    if [ -L '/usr/bin/mouse-profile-manager' -a -e '/usr/bin/mouse-profile-manager' -a "$(readlink '/usr/bin/mouse-profile-manager')" != '/etc/alternatives/mouse-profile-manager' ]; then
        rm -f '/usr/bin/mouse-profile-manager'
    fi
    update-alternatives --install '/usr/bin/mouse-profile-manager' 'mouse-profile-manager' '/opt/Mouse Profile Manager/mouse-profile-manager' 100 || ln -sf '/opt/Mouse Profile Manager/mouse-profile-manager' '/usr/bin/mouse-profile-manager'
else
    ln -sf '/opt/Mouse Profile Manager/mouse-profile-manager' '/usr/bin/mouse-profile-manager'
fi

# Sem namespaces de usuário liberados (ex.: Ubuntu 24.04 com AppArmor), o sandbox do
# Chromium precisa do chrome-sandbox com SUID.
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    chmod 4755 '/opt/Mouse Profile Manager/chrome-sandbox' || true
else
    chmod 0755 '/opt/Mouse Profile Manager/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi
if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# Regra udev que libera os mouses ao usuário logado, aplicada já (sem reconectar o
# receptor nem reiniciar).
install -D -m 644 '/opt/Mouse Profile Manager/resources/linux/70-mouse-profile-manager.rules' /etc/udev/rules.d/70-mouse-profile-manager.rules
udevadm control --reload-rules || true
udevadm trigger --subsystem-match=hidraw --subsystem-match=input --action=change || true

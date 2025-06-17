/*!
 * Copyright (C) 2023 Lju
 *
 * This file is part of Astra Monitor extension for GNOME Shell.
 * [https://github.com/AstraExt/astra-monitor]
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import Mtk from 'gi://Mtk';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Signal from './signal.js';
import Utils from './utils/utils.js';
import Grid from './grid.js';
import Config from './config.js';
class MenuBase extends PopupMenu.PopupMenu {
    constructor(sourceActor, arrowAlignment, params = {}) {
        super(sourceActor, arrowAlignment, params.arrowSide ?? MenuBase.openingSide);
        this.lastForcedUpdate = new Map();
        this.name = params.name ?? 'Unnamed Menu';
        Utils.verbose(`Creating ${this.name}`);
        if (params.scrollable) {
            const scrollView = new St.ScrollView({
                xExpand: true,
                yExpand: true,
                yAlign: Clutter.ActorAlign.START,
            });
            scrollView.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
            const boxLayout = new St.BoxLayout({
                vertical: true,
            });
            scrollView.add_child(boxLayout);
            this.statusMenu = new PopupMenu.PopupMenuSection();
            this.addMenuItem(this.statusMenu);
            const scrollActor = new St.Bin({ child: scrollView });
            this.statusMenu.actor.add_child(scrollActor);
            this.grid = new Grid({ numCols: params.numCols || 2 });
            boxLayout.add_child(this.grid);
            this.actor.add_style_class_name('panel-menu');
            Main.uiGroup.add_child(this.actor);
            this.actor.hide();
        }
        else {
            this.statusMenu = new PopupMenu.PopupMenuSection();
            this.grid = new Grid({ numCols: params.numCols || 2 });
            this.statusMenu.box.add_child(this.grid);
            this.addMenuItem(this.statusMenu);
            this.actor.add_style_class_name('panel-menu');
            Main.uiGroup.add_child(this.actor);
            this.actor.hide();
        }
    }
    static get arrowAlignement() {
        const shellBarPosition = Config.get_string('shell-bar-position');
        if (shellBarPosition === 'top')
            return St.Side.TOP;
        if (shellBarPosition === 'bottom')
            return St.Side.BOTTOM;
        if (shellBarPosition === 'left')
            return St.Side.LEFT;
        return St.Side.RIGHT;
    }
    static getMonitorSize(actorBox) {
        const display = global.display;
        const rect = new Mtk.Rectangle({
            x: actorBox.x1,
            y: actorBox.y1,
            width: actorBox.x2 - actorBox.x1,
            height: actorBox.y2 - actorBox.y1,
        });
        let monitorIndex = display.get_monitor_index_for_rect(rect);
        if (monitorIndex === -1)
            monitorIndex = display.get_primary_monitor();
        const geometry = display.get_monitor_geometry(monitorIndex);
        return { width: geometry.width, height: geometry.height };
    }
    addMenuSection(text, add = true, newLine = false) {
        const label = new St.Label({ text, styleClass: 'astra-monitor-menu-header-centered' });
        if (add) {
            if (newLine)
                this.grid.newLine();
            this.addToMenu(label, this.grid.getNumCols());
        }
        return label;
    }
    addMenuSeparator(text, add = true, newLine = false) {
        const separator = new PopupMenu.PopupSeparatorMenuItem(text);
        if (add) {
            if (newLine)
                this.grid.newLine();
            this.addToMenu(separator, this.grid.getNumCols());
        }
        return separator;
    }
    addToMenu(widget, colSpan = 1) {
        this.grid.addToGrid(widget, colSpan);
    }
    get selectionStyle() {
        if (Utils.themeStyle === 'light')
            return 'background-color:rgba(0,0,0,0.1);box-shadow: 0 0 2px rgba(255,255,255,0.2);border-radius:0.3em;';
        return 'background-color:rgba(255,255,255,0.1);box-shadow: 0 0 2px rgba(0,0,0,0.2);border-radius:0.3em;';
    }
    addUtilityButtons(category, addButtons) {
        this.utilityBox = new St.BoxLayout({
            styleClass: 'astra-monitor-menu-button-box',
            xAlign: Clutter.ActorAlign.CENTER,
            reactive: true,
            xExpand: true,
        });
        if (addButtons)
            addButtons(this.utilityBox);
        const appSys = Shell.AppSystem.get_default();
        let app = appSys.lookup_app('org.gnome.SystemMonitor.desktop');
        if (app) {
            this.systemMonitorButton = new St.Button({ styleClass: 'button' });
            this.systemMonitorButton.child = new St.Icon({
                gicon: Utils.getLocalIcon('am-system-monitor-symbolic'),
                fallbackIconName: 'org.gnome.SystemMonitor-symbolic',
            });
            Signal.connect(this.systemMonitorButton, 'clicked', () => {
                this.close(true);
                app.activate();
            });
            this.utilityBox.add_child(this.systemMonitorButton);
        }
        else {
            app = appSys.lookup_app('gnome-system-monitor.desktop');
            if (app) {
                this.systemMonitorButton = new St.Button({ styleClass: 'button' });
                this.systemMonitorButton.child = new St.Icon({
                    gicon: Utils.getLocalIcon('am-system-monitor-symbolic'),
                    fallbackIconName: 'org.gnome.SystemMonitor-symbolic',
                });
                Signal.connect(this.systemMonitorButton, 'clicked', () => {
                    this.close(true);
                    app.activate();
                });
                this.utilityBox.add_child(this.systemMonitorButton);
            }
        }
        this.preferencesButton = new St.Button({ styleClass: 'button' });
        this.preferencesButton.child = new St.Icon({
            gicon: Utils.getLocalIcon('am-settings-symbolic'),
            fallbackIconName: 'preferences-system-symbolic',
        });
        Signal.connect(this.preferencesButton, 'clicked', () => {
            this.close(true);
            try {
                if (category)
                    Config.set('queued-pref-category', category, 'string');
                if (!Utils.extension)
                    throw new Error('Extension not found');
                Utils.extension.openPreferences();
            }
            catch (err) {
                Utils.log(`Error opening settings: ${err}`);
            }
        });
        this.utilityBox.add_child(this.preferencesButton);
        this.addToMenu(this.utilityBox, this.grid.getNumCols());
    }
    async onOpen() { }
    onClose() { }
    needsUpdate(code, forced = false) {
        if (forced) {
            const lastUpdate = this.lastForcedUpdate.get(code);
            if (lastUpdate && Date.now() - lastUpdate < 1000) {
                return false;
            }
            this.lastForcedUpdate.set(code, Date.now());
        }
        return true;
    }
    update(_code, _forced = false) {
        Utils.error('update() needs to be overridden');
    }
    destroy() {
        this.close(false);
        Config.clear(this);
        Signal.clear(this);
        Signal.clear(this.systemMonitorButton);
        Signal.clear(this.preferencesButton);
        this.onClose();
        this.systemMonitorButton?.destroy();
        this.systemMonitorButton = undefined;
        this.preferencesButton?.destroy();
        this.preferencesButton = undefined;
        this.grid?.destroy();
        this.grid = undefined;
        this.statusMenu?.destroy();
        this.statusMenu = undefined;
        this.removeAll();
        Main.uiGroup.remove_child(this.actor);
        super.destroy();
    }
}
MenuBase.openingSide = St.Side.RIGHT;
export default MenuBase;

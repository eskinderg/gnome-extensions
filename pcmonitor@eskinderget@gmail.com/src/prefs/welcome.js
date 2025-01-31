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
import Adw from 'gi://Adw';
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Utils from '../utils/utils.js';
import PrefsUtils from './prefsUtils.js';
export default class Welcome {
    constructor(prefs) {
        this.setupWelcome(prefs);
    }
    get page() {
        return this.welcome;
    }
    setupWelcome(_prefs) {
        this.welcome = new Adw.NavigationPage({
            title: _('Welcome'),
            tag: 'welcome',
        });
        const toolbar = new Adw.ToolbarView();
        const header = new Adw.HeaderBar();
        header.showTitle = false;
        toolbar.add_top_bar(header);
        const welcomePage = this.getWelcomePage();
        toolbar.set_content(welcomePage);
        this.welcome.set_child(toolbar);
    }
    getWelcomePage() {
        const visualizationPage = new Adw.PreferencesPage({});
        let group = new Adw.PreferencesGroup({ title: _('Dependencies') });
        let check = true;
        if (!Utils.hasProcStat()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _('Cannot access /proc/stat: this extension will not work!') }, 'am-dialog-error-symbolic', group);
        }
        if (!Utils.hasProcCpuinfo()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _('Cannot access /proc/cpuinfo: this extension will not work!') }, 'am-dialog-error-symbolic', group);
        }
        if (!Utils.hasProcMeminfo()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _('Cannot access /proc/meminfo: this extension will not work!') }, 'am-dialog-error-symbolic', group);
        }
        if (!Utils.hasProcDiskstats()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _('Cannot access /proc/diskstats: this extension will not work!') }, 'am-dialog-error-symbolic', group);
        }
        if (!Utils.hasProcNetDev()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _('Cannot access /proc/net/dev: this extension will not work!') }, 'am-dialog-error-symbolic', group);
        }
        if (!Utils.hasPs()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _("Cannot access 'ps': this extension will not work!") }, 'am-dialog-error-symbolic', group);
        }
        if (!Utils.hasHwmon()) {
            check = false;
            PrefsUtils.addStatusLabel({
                title: _('Cannot access /sys/class/hwmon: sensors monitoring will not work!'),
            }, 'am-dialog-error-symbolic', group);
        }
        if (!Utils.hasLscpu()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _("'lscpu' not installed: some features will be disabled!") }, 'am-dialog-warning-symbolic', group);
        }
        if (!Utils.hasLspci()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _("'lspci' not installed: some features will be disabled!") }, 'am-dialog-warning-symbolic', group);
        }
        if (!Utils.hasLsblk()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _("'lsblk' not installed: some features will be disabled!") }, 'am-dialog-warning-symbolic', group);
        }
        if (!Utils.hasCoresFrequency()) {
            check = false;
            PrefsUtils.addStatusLabel({
                title: _('Cannot access /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq: some features will be disabled!'),
            }, 'am-dialog-warning-symbolic', group);
        }
        if (!Utils.hasNethogs()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _("'NetHogs' not installed: some optional features will be disabled!") }, 'am-dialog-warning-symbolic', group);
        }
        if (!Utils.hasIp()) {
            check = false;
            PrefsUtils.addStatusLabel({ title: _("'iproute2' not installed: some features will be disabled!") }, 'am-dialog-warning-symbolic', group);
        }
        if (!Utils.hasIw() && !Utils.hasIwconfig()) {
            check = false;
            PrefsUtils.addStatusLabel({
                title: _("'iwconfig' and 'iw' not installed: install one of them to enable wireless network info!"),
            }, 'am-dialog-warning-symbolic', group);
        }
        if (!Utils.hasIotop()) {
            check = false;
            PrefsUtils.addStatusLabel({
                title: _("'iotop' not installed: some optional features will be disabled!"),
            }, 'am-dialog-warning-symbolic', group);
        }
        if (Utils.hasAMDGpu() && !Utils.hasAmdGpuTop()) {
            check = false;
            PrefsUtils.addStatusLabel({
                title: _("AMD GPU detected but 'amdgpu_top' not installed: some optional features will be disabled!"),
            }, 'am-dialog-warning-symbolic', group);
        }
        if (Utils.hasNVidiaGpu() && !Utils.hasNvidiaSmi()) {
            check = false;
            PrefsUtils.addStatusLabel({
                title: _("NVidia GPU detected but 'nvidia-smi' not installed: some optional features will be disabled!"),
            }, 'am-dialog-warning-symbolic', group);
        }
        const statusLabel = PrefsUtils.addStatusLabel({ title: _('Checking GTop dependency...') }, 'am-dialog-info-symbolic', group);
        Utils.hasGTop()
            .then((GTopAvailable) => {
            if (!GTopAvailable) {
                statusLabel.row.title = _("'GTop' not installed, some optional features will be disabled! For a better experience and performance, install it from your package manager.");
                statusLabel.icon.set_from_icon_name('am-dialog-warning-symbolic');
            }
            else {
                statusLabel.row.title = _("'GTop' successfully detected and added to Data Sources list.");
                statusLabel.icon.set_from_icon_name('am-dialog-ok-symbolic');
            }
        })
            .catch((e) => {
            Utils.error('Error checking GTop dependency', e);
            statusLabel.row.title = _("'GTop' not installed, some optional features will be disabled! For a better experience and performance, install it from your package manager.");
            statusLabel.icon.set_from_icon_name('am-dialog-warning-symbolic');
        });
        if (check) {
            PrefsUtils.addStatusLabel({ title: _('All other dependencies are met!') }, 'am-dialog-ok-symbolic', group);
        }
        visualizationPage.add(group);
        group = new Adw.PreferencesGroup({ title: _('Support Us') });
        PrefsUtils.addLinkRow({ title: '<span color="#FFB000">★ ' + _('Support us on Ko-Fi') + '</span>' }, 'https://ko-fi.com/astraext', group);
        PrefsUtils.addLinkRow({ title: '<span color="#FFB000">★ ' + _('Buy us a coffee') + '</span>' }, 'https://www.buymeacoffee.com/astra.ext', group);
        PrefsUtils.addLinkRow({ title: '<span color="#FFB000">★ ' + _('Become a patron') + '</span>' }, 'https://www.patreon.com/AstraExt', group);
        visualizationPage.add(group);
        return visualizationPage;
    }
}

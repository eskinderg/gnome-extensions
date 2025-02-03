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
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Header from '../header.js';
import Config from '../config.js';
import Utils from '../utils/utils.js';
import NetworkMenu from './networkMenu.js';
import NetworkGraph from './networkGraph.js';
import NetworkBars from './networkBars.js';
import MenuBase from '../menu.js';
export default GObject.registerClass(class NetworkHeader extends Header {
    constructor() {
        super('Network Header');
        this.buildIcon();
        this.buildGraph();
        this.buildSpeed();
        this.buildBars();
        this.addOrReorderIndicators();
        const menu = new NetworkMenu(this, 0.5, MenuBase.arrowAlignement);
        this.setMenu(menu);
        this.resetMaxWidths();
        Config.connect(this, 'changed::network-indicators-order', this.addOrReorderIndicators.bind(this));
        Config.connect(this, 'changed::visible', this.resetMaxWidths.bind(this));
        Config.connect(this, 'changed::network-header-io', this.resetMaxWidths.bind(this));
        Config.connect(this, 'changed::headers-font-family', this.resetMaxWidths.bind(this));
        Config.connect(this, 'changed::headers-font-size', this.resetMaxWidths.bind(this));
        const updateIOLayout = () => {
            this.ioLayout = Config.get_string('network-header-io-layout') || 'vertical';
            this.speed.text = '';
            this.resetMaxWidths();
        };
        Config.connect(this, 'changed::network-header-io-layout', updateIOLayout.bind(this));
        updateIOLayout();
    }
    get showConfig() {
        return 'network-header-show';
    }
    addOrReorderIndicators() {
        const indicators = Utils.getIndicatorsOrder('network');
        let position = 0;
        for (const indicator of indicators) {
            let widget;
            switch (indicator) {
                case 'icon':
                    widget = this.icon;
                    break;
                case 'IO bar':
                    widget = this.bars;
                    break;
                case 'IO graph':
                    widget = this.graph;
                    break;
                case 'IO speed':
                    widget = this.speedContainer;
                    break;
            }
            if (widget) {
                if (widget.get_parent())
                    this.remove_child(widget);
                this.insert_child_at_index(widget, position++);
            }
        }
    }
    resetMaxWidths() {
        this.maxWidths = [];
        if (!Config.get_boolean('network-header-io'))
            return;
        if (!this.speed.get_stage())
            return;
        this.fixSpeedContainerStyle();
    }
    buildIcon() {
        const defaultStyle = 'margin-left:2px;margin-right:4px;';
        let iconSize = Config.get_int('network-header-icon-size');
        iconSize = Math.max(8, Math.min(30, iconSize));
        this.icon = new St.Icon({
            fallbackGicon: Utils.getLocalIcon('am-network-symbolic'),
            style: defaultStyle,
            iconSize: iconSize,
            yExpand: false,
            yAlign: Clutter.ActorAlign.CENTER,
            xAlign: Clutter.ActorAlign.CENTER,
        });
        const setIconName = () => {
            const iconCustom = Config.get_string('network-header-icon-custom');
            if (iconCustom)
                this.icon.iconName = iconCustom;
            else
                this.icon.gicon = Utils.getLocalIcon('am-network-symbolic');
        };
        setIconName();
        const setIconColor = () => {
            const iconColor = Config.get_string('network-header-icon-color');
            if (iconColor)
                this.icon.style = defaultStyle + 'color:' + iconColor + ';';
            else
                this.icon.style = defaultStyle;
        };
        setIconColor();
        Config.bind('network-header-icon', this.icon, 'visible', Gio.SettingsBindFlags.GET);
        Config.bind('network-header-icon-size', this.icon, 'icon_size', Gio.SettingsBindFlags.GET);
        Config.connect(this.icon, 'changed::network-header-icon-custom', setIconName.bind(this));
        Config.connect(this.icon, 'changed::network-header-icon-color', setIconColor.bind(this));
    }
    buildBars() {
        if (this.bars) {
            this.remove_child(this.bars);
            Config.clear(this.bars);
            Utils.networkMonitor.unlisten(this.bars);
            this.bars.destroy();
        }
        this.bars = new NetworkBars({ numBars: 2, header: true, mini: true, width: 0.5 });
        Config.bind('network-header-bars', this.bars, 'visible', Gio.SettingsBindFlags.GET);
        Utils.networkMonitor.listen(this.bars, 'networkIO', () => {
            if (!Config.get_boolean('network-header-bars'))
                return;
            const usage = Utils.networkMonitor.getCurrentValue('networkIO');
            const maxSpeeds = Utils.networkMonitor.detectedMaxSpeeds;
            this.bars.setMaxSpeeds(maxSpeeds);
            this.bars.setUsage(usage);
        });
    }
    buildGraph() {
        if (this.graph) {
            this.remove_child(this.graph);
            Config.clear(this.graph);
            Utils.networkMonitor.unlisten(this.graph);
            this.graph.destroy();
        }
        {
            let graphWidth = Config.get_int('network-header-graph-width');
            graphWidth = Math.max(10, Math.min(500, graphWidth));
            this.graph = new NetworkGraph({ width: graphWidth, mini: true });
        }
        Config.bind('network-header-graph', this.graph, 'visible', Gio.SettingsBindFlags.GET);
        Config.connect(this.graph, 'changed::network-header-graph-width', () => {
            let graphWidth = Config.get_int('network-header-graph-width');
            graphWidth = Math.max(10, Math.min(500, graphWidth));
            this.graph.setWidth(graphWidth);
        });
        Utils.networkMonitor.listen(this.graph, 'networkIO', this.updateGraph.bind(this));
    }
    updateGraph() {
        if (!this.visible)
            return;
        if (!Config.get_boolean('network-header-graph'))
            return;
        const usage = Utils.networkMonitor.getUsageHistory('networkIO');
        this.graph.setUsageHistory(usage);
    }
    buildSpeed() {
        this.speedContainer = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.START,
            yAlign: Clutter.ActorAlign.CENTER,
            yExpand: true,
            xExpand: true,
        });
        this.speed = new St.Label({
            text: '',
            styleClass: 'astra-monitor-header-speed-label',
            style: 'font-weight:bold; border: none; padding:0; margin:0; text-align:right;',
            yAlign: Clutter.ActorAlign.CENTER,
            xAlign: Clutter.ActorAlign.END,
            xExpand: true,
            yExpand: true,
            width:80
        });

        this.sep = new St.Label({
            text: '|',
            styleClass: 'astra-monitor-header-speed-label',
            style: 'font-weight:bold; text-align: center; border: none; padding:0; margin: 0 5px 0 5px;',
            yAlign: Clutter.ActorAlign.CENTER,
            xAlign: Clutter.ActorAlign.START,
            xExpand: true,
            yExpand: true,
            width:20
        });

        this.speed2 = new St.Label({
            text: '',
            styleClass: 'astra-monitor-header-speed-label',
            style: 'font-size: 12px; font-weight: bold; border: none; padding:0; margin:0; text-align:left;',
            yAlign: Clutter.ActorAlign.CENTER,
            xAlign: Clutter.ActorAlign.START,
            xExpand: true,
            yExpand: true,
            width:60
        });

        this.speedContainer.set_vertical(false);
      
        this.speedContainer.add_child(this.speed);
        this.speedContainer.add_child(this.sep);
        this.speedContainer.add_child(this.speed2);

        Config.bind('network-header-io', this.speedContainer, 'visible', Gio.SettingsBindFlags.GET);
        Utils.networkMonitor.listen(this.speedContainer, 'networkIO', this.updateSpeed.bind(this));
    }
    updateSpeed() {
        if (!this.visible)
            return;
        if (!Config.get_boolean('network-header-io'))
            return;
        let upload = Utils.zeroStr + ' B/s';
        let download = Utils.zeroStr + ' B/s';
        const usage = Utils.networkMonitor.getCurrentValue('networkIO');
        // console.log(Math.trunc(usage.bytesDownloadedPerSec/1000));
        if (usage) {
            let bytesUploadedPerSec = usage.bytesUploadedPerSec;
            let bytesDownloadedPerSec = usage.bytesDownloadedPerSec;
            const threshold = Config.get_int('network-header-io-threshold');
            if (bytesUploadedPerSec < threshold * 1000)
                bytesUploadedPerSec = 0;
            if (bytesDownloadedPerSec < threshold * 100)
                bytesDownloadedPerSec = 0;
            const unit = Config.get_string('network-io-unit');
            let maxFigures = Config.get_int('network-header-io-figures');
            maxFigures = Math.max(1, Math.min(4, maxFigures));
            upload = Utils.formatBytesPerSec(bytesUploadedPerSec, unit, maxFigures, true);
            download = Utils.formatBytesPerSec(bytesDownloadedPerSec, unit, maxFigures, true);
        }
        let downloadSpeed = Math.trunc(usage.bytesDownloadedPerSec/1000);
        let uploadSpeed = Math.trunc(usage.bytesUploadedPerSec/1000);
        if (this.ioLayout === 'horizontal')
            this.speed.text = `${download} | ${upload}`;
        else {
            // this.speed.text = `${download}\n${upload}`;
          if(downloadSpeed > 1)
            this.speed.text = `${this.formatSpeed(usage.bytesDownloadedPerSec)}`;
          else
            this.speed.text = '0 KB/s';

          if(uploadSpeed > 1)
            this.speed2.text = `${this.formatSpeed(usage.bytesUploadedPerSec)}`;
          else
            this.speed2.text = '0 KB/s';
        }
        this.fixSpeedContainerStyle();
    }

    formatSpeed(bytesPerSec) {
        if (bytesPerSec <= 0) return "0 B/s";

        const units = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
        let index = Math.min(Math.floor(Math.log2(bytesPerSec) / 10), units.length - 1);
        let speed = bytesPerSec / (1 << (index * 10));

        let formattedSpeed = (index === 1) ? Math.round(speed) : (index === 2 ? speed.toFixed(1) : speed.toFixed(2));

        return `${formattedSpeed} ${units[index]}`;
    }

    fixSpeedContainerStyle() {
        if (!this.speedContainer.get_parent())
            return;
        if (!this.speed.get_parent())
            return;
        // const calculateStyle = () => {
        //     let defaultStyle = 'font-size:14px;';
        //     // const fontSize = Config.get_int('headers-font-size');
        //     const fontSize = 15;
        //     if (fontSize)
        //         defaultStyle = `font-size:${fontSize}px;`;
        //     if (this.ioLayout === 'horizontal')
        //         return fontSize ? defaultStyle : 'font-size:14px';
        //     const superHeight = this.speedContainer.get_parent()?.get_allocation_box()?.get_height() ?? 0;
        //     let scaledHeight = superHeight / this.scaleFactor;
        //     if (scaledHeight <= 20)
        //         return defaultStyle;
        //     scaledHeight = Math.round(scaledHeight / 3);
        //     if (fontSize && fontSize < scaledHeight)
        //         return defaultStyle;
        //     return `font-size:14px;`;
        // };
        // const style = calculateStyle();
        // if (this.speed.style !== style) {
        //     this.speed.style = style;
        //     this.speed.queue_relayout();
        //     this.speedContainer.queue_relayout();
        // }
        // const speedWidth = this.speed.get_preferred_width(-1);
        // const width = speedWidth ? speedWidth[1] : 0;
        // this.maxWidths.push(width);
        // if (this.maxWidths.length > Utils.networkMonitor.updateFrequency * 30)
        //     this.maxWidths.shift();
        // let max = Math.max(...this.maxWidths);
        // if (max === this.speedContainer.width)
        //     return;
        // if (max <= 0)
        //     max = 1;
        // this.speedContainer.set_width(max);
    }
    update() {
        this.maxWidths = [];
        this.updateGraph();
        this.updateSpeed();
    }
    redraw() {
        this.maxWidths = [];
        this.fixSpeedContainerStyle();
    }
    createTooltip() {
        this.tooltipMenu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
        Main.uiGroup.add_child(this.tooltipMenu.actor);
        this.tooltipMenu.actor.add_style_class_name('astra-monitor-tooltip-menu');
        this.tooltipMenu.actor.xExpand = true;
        this.tooltipMenu.actor.hide();
        this.tooltipItem = new PopupMenu.PopupMenuItem('', {
            reactive: true,
            style_class: 'astra-monitor-tooltip-item',
        });
        this.tooltipItem.actor.xExpand = true;
        this.tooltipItem.actor.xAlign = Clutter.ActorAlign.CENTER;
        this.tooltipItem.sensitive = true;
        this.tooltipMenu.addMenuItem(this.tooltipItem);
        Config.connect(this.tooltipMenu, 'changed::network-header-tooltip', () => {
            if (!Config.get_boolean('network-header-tooltip'))
                this.tooltipMenu.close(true);
        });
        Utils.networkMonitor.listen(this.tooltipMenu, 'networkIO', () => {
            if (!Config.get_boolean('network-header-tooltip'))
                return;
            const values = [];
            if (Config.get_boolean('network-header-tooltip-io')) {
                const usage = Utils.networkMonitor.getCurrentValue('networkIO');
                if (usage) {
                    const bytesUploadedPerSec = usage.bytesUploadedPerSec;
                    const bytesDownloadedPerSec = usage.bytesDownloadedPerSec;
                    const unit = Config.get_string('network-io-unit');
                    let maxFigures = Config.get_int('network-header-io-figures');
                    maxFigures = Math.max(1, Math.min(4, maxFigures));
                    values.push('↑' +
                        Utils.formatBytesPerSec(bytesUploadedPerSec, unit, maxFigures, true));
                    values.push('↓' +
                        Utils.formatBytesPerSec(bytesDownloadedPerSec, unit, maxFigures, true));
                }
            }
            if (values.length === 0)
                values.push('-');
            this.tooltipItem.label.text = values.join(' | ');
            const width = this.tooltipItem.get_preferred_width(-1)[1] + 30;
            this.tooltipMenu.actor.set_width(width);
        });
    }
    showTooltip() {
        if (!this.tooltipMenu)
            return;
        if (!Config.get_boolean('network-header-tooltip'))
            return;
        this.tooltipMenu.open(false);
    }
    hideTooltip() {
        if (!this.tooltipMenu)
            return;
        if (!Config.get_boolean('network-header-tooltip'))
            return;
        this.tooltipMenu.close(false);
    }
    destroy() {
        Config.clear(this);
        Utils.networkMonitor.unlisten(this);
        Config.clear(this.icon);
        if (this.bars) {
            Config.clear(this.bars);
            Utils.networkMonitor.unlisten(this.bars);
        }
        if (this.graph) {
            Config.clear(this.graph);
            Utils.networkMonitor.unlisten(this.graph);
        }
        if (this.speedContainer) {
            Config.clear(this.speedContainer);
            Utils.networkMonitor.unlisten(this.speedContainer);
        }
        if (this.tooltipMenu) {
            Config.clear(this.tooltipMenu);
            Utils.networkMonitor.unlisten(this.tooltipMenu);
            this.tooltipMenu.close(false);
        }
        super.destroy();
    }
});

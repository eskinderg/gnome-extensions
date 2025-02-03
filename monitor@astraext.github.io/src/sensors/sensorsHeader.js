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
import Pango from 'gi://Pango';
import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Header from '../header.js';
import Config from '../config.js';
import Utils from '../utils/utils.js';
import Grid from '../grid.js';
import SensorsMenu from './sensorsMenu.js';
import SensorBars from './sensorBars.js';
import MenuBase from '../menu.js';
export default GObject.registerClass(class SensorsHeader extends Header {
    constructor() {
        super('Sensors Header');
        this.sensorsNum = 1;
        this.maxWidths1 = [];
        this.maxWidths2 = [];
        this.buildIcon();
        this.buildValues();
        this.buildBar();
        this.addOrReorderIndicators();
        const menu = new SensorsMenu(this, 0.5, MenuBase.arrowAlignement);
        this.setMenu(menu);
        this.resetMaxWidths();
        Config.connect(this, 'changed::sensors-indicators-order', this.addOrReorderIndicators.bind(this));
        Config.connect(this, 'changed::visible', this.resetMaxWidths.bind(this));
        Config.connect(this, 'changed::sensors-header-sensor1-show', this.resetMaxWidths.bind(this));
        Config.connect(this, 'changed::sensors-header-sensor2-show', this.resetMaxWidths.bind(this));
        // Config.connect(this, 'changed::headers-font-family', this.resetMaxWidths.bind(this));
        // Config.connect(this, 'changed::headers-font-size', this.resetMaxWidths.bind(this));
        const updateSensorsLayout = () => {
            this.sensorsLayout =
                Config.get_string('sensors-header-sensor2-layout') || 'vertical';
            this.sensorLabel1.text = '';
            this.sensorLabel2.text = '';
            this.resetMaxWidths();
        };
        Config.connect(this, 'changed::sensors-header-sensor2-layout', updateSensorsLayout.bind(this));
        updateSensorsLayout();
    }
    get showConfig() {
        return 'sensors-header-show';
    }
    addOrReorderIndicators() {
        const indicators = Utils.getIndicatorsOrder('sensors');
        indicators.unshift('bar');
        let position = 0;
        for (const indicator of indicators) {
            let widget;
            switch (indicator) {
                case 'icon':
                    widget = this.icon;
                    break;
                case 'bar':
                    widget = this.bar;
                    break;
                case 'value':
                    widget = this.valuesContainer;
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
        this.maxWidths1 = [];
        this.maxWidths2 = [];
        if (!this.sensorLabel1.get_stage())
            return;
        if (!this.sensorLabel2.get_stage())
            return;
        this.fixContainerStyle();
    }

    buildBar() {

        if (this.bar) {
            this.remove_child(this.bar);
            Config.clear(this.bar);
            Utils.memoryMonitor.unlisten(this.bar);
            this.bar.destroy();
        }

        this.bar = new SensorBars({
            layout: 'horizontal',
            header: true,
            mini: true,
            width: 40,
            height: 0.8,
            breakdownConfig: 'memory-header-bars-breakdown',
        });

      Utils.sensorsMonitor.listen(this.bar, 'sensorsData', this.updateBar.bind(this));

    }

    updateBar() {
      // const usage = Utils.processorMonitor.getCurrentValue('cpuUsage');
            // Utils.processorMonitor.listen(this.bars, 'cpuUsage', this.updateBars.bind(this));
      const sensorsData = Utils.sensorsMonitor.getCurrentValue('sensorsData');
        if (sensorsData) {
          let sensor1;
          const sensor1Source = Config.get_json('sensors-header-sensor1');
          const sensor1Digits = Config.get_int('sensors-header-sensor1-digits');
          sensor1 = this.applySource(sensorsData, sensor1Source, sensor1Digits);
          this.bar.setUsage([{user:100,total:parseInt(sensor1)}]);
        }
        // this.bar.setUsage([{user:100,total:100}]);

    }

    buildIcon() {
        const defaultStyle = 'margin-left:2px;';
        let iconSize = Config.get_int('sensors-header-icon-size');
        iconSize = Math.max(8, Math.min(30, iconSize));
        this.icon = new St.Icon({
            fallbackGicon: Utils.getLocalIcon('am-temperature-symbolic'),
            style: defaultStyle,
            iconSize: iconSize,
            yExpand: false,
            yAlign: Clutter.ActorAlign.CENTER,
            xAlign: Clutter.ActorAlign.CENTER,
        });
        const setIconName = () => {
            const iconCustom = Config.get_string('sensors-header-icon-custom');
            if (iconCustom)
                this.icon.iconName = iconCustom;
            else
                this.icon.gicon = Utils.getLocalIcon('am-temperature-symbolic');
        };
        setIconName();
        const setIconColor = () => {
            const iconColor = Config.get_string('sensors-header-icon-color');
            if (iconColor)
                this.icon.style = defaultStyle + 'color:' + iconColor + ';';
            else
                this.icon.style = defaultStyle;
        };
        setIconColor();
        Config.bind('sensors-header-icon', this.icon, 'visible', Gio.SettingsBindFlags.GET);
        Config.bind('sensors-header-icon-size', this.icon, 'icon_size', Gio.SettingsBindFlags.GET);
        Config.connect(this.icon, 'changed::sensors-header-icon-custom', setIconName.bind(this));
        Config.connect(this.icon, 'changed::sensors-header-icon-color', setIconColor.bind(this));
    }
    buildValues() {
        // this.valuesContainer = new St.BoxLayout({
        //     xAlign: Clutter.ActorAlign.START,
        //     yAlign: Clutter.ActorAlign.FILL,
        //     yExpand: true,
        //     vertical: true,
        //     width: 1,
        // });

        this.valuesContainer = new St.BoxLayout({
            xAlign: Clutter.ActorAlign.START,
            yAlign: Clutter.ActorAlign.START,
            yExpand: false,
            vertical: true,
        });

        // this.sensorGrid = new Grid({
        //     numCols: 2,
        //     styleClass: '',
        //     xAlign: Clutter.ActorAlign.END,
        //     yAlign: Clutter.ActorAlign.FILL,
        // });
        // this.valuesContainer.add_child(this.sensorGrid);
        this.sensorLabel1 = new St.Label({
            text: '',
            yAlign: Clutter.ActorAlign.CENTER,
            xAlign: Clutter.ActorAlign.START,
            // xExpand: true,
            // yExpand: true,
        });
        this.sensorLabel1.clutterText.ellipsize = Pango.EllipsizeMode.NONE;
        this.sensorLabel1.clutterText.lineWrap = false;
        // this.sensorGrid.addToGrid(this.sensorLabel1);
        this.sensorLabel2 = new St.Label({
            text: '',
            yAlign: Clutter.ActorAlign.CENTER,
            xAlign: Clutter.ActorAlign.START,
            // xExpand: true,
            // yExpand: true,
        });
        // this.sensorLabel2.clutterText.ellipsize = Pango.EllipsizeMode.NONE;
        // this.sensorLabel2.clutterText.lineWrap = false;
        // this.sensorGrid.addToGrid(this.sensorLabel2);
        this.valuesContainer.add_child(this.sensorLabel1)
        this.valuesContainer.add_child(this.sensorLabel2)

        Config.bind('sensors-header-sensor1-show', this.valuesContainer, 'visible', Gio.SettingsBindFlags.GET);
        Utils.sensorsMonitor.listen(this.valuesContainer, 'sensorsData', this.updateValues.bind(this));
    }
    updateValues() {
        if (!this.visible)
            return;
        if (!Config.get_boolean('sensors-header-sensor1-show') &&
            !Config.get_boolean('sensors-header-sensor2-show'))
            return;
        let sensor1 = '-';
        let sensor2 = '-';
        const sensorsData = Utils.sensorsMonitor.getCurrentValue('sensorsData');
        if (sensorsData) {
            const sensor1Source = Config.get_json('sensors-header-sensor1');
            const sensor1Digits = Config.get_int('sensors-header-sensor1-digits');
            sensor1 = this.applySource(sensorsData, sensor1Source, sensor1Digits);
            if (Config.get_boolean('sensors-header-sensor2-show')) {
                const sensor2Source = Config.get_json('sensors-header-sensor2');
                const sensor2Digits = Config.get_int('sensors-header-sensor2-digits');
                sensor2 = this.applySource(sensorsData, sensor2Source, sensor2Digits);
            }
            else {
                sensor2 = '';
            }
        }
        if (sensor2) {
            this.sensorsNum = 2;
            if (this.sensorsLayout === 'horizontal') {
                this.sensorLabel1.text = `${sensor1}`;
                this.sensorLabel2.text = sensor2;
                this.sensorLabel2.visible = true;
            }
            else if (this.sensorsLayout === 'vertical') {
                this.sensorLabel1.text = `${sensor1}`;
                // this.sensorLabel2.text = '';
                // this.sensorLabel2.visible = false;
                this.sensorLabel2.text = `${sensor2}`;
            }
        }
        else {
            this.sensorsNum = 1;
            this.sensorLabel1.text = sensor1;
            this.sensorLabel2.visible = false;
        }
        this.fixContainerStyle(sensor1);
    }
    applySource(sensorsData, sensorSource, sensorDigits = -1) {
        if (!sensorSource || !sensorSource.service)
            return '-';
        let service = sensorSource.service;
        if (service === 'sensors')
            service = 'lm_sensors';
        if (!sensorsData[service])
            return '-';
        let node = sensorsData[service];
        let step;
        for (step of sensorSource.path) {
            if (!node)
                return '-';
            const tmp = node.children.get(step);
            if (!tmp)
                return '-';
            node = tmp;
        }
        if (!node)
            return '-';
        let value;
        let unit;
        if (!node.attrs.value)
            return '-';
        value = node.attrs.value;
        if (node.attrs.unit)
            unit = node.attrs.unit;
        else
            unit = Utils.inferMeasurementUnit(step || '');
        if (unit) {
            if (unit === '°C' &&
                Config.get_string('sensors-temperature-unit') === 'fahrenheit') {
                value = Utils.celsiusToFahrenheit(value);
                unit = '°F';
            }
            if (Utils.isNumeric(value)) {
                if (sensorDigits >= 0)
                    value = value.toFixed(sensorDigits);
                else if (!Utils.isIntOrIntString(value))
                    value = value.toFixed(1);
            }
            return value + ' ' + unit;
        }
        if (!Utils.isIntOrIntString(value) && Utils.isNumeric(value))
            value = value.toFixed(1);
        return value;
    }
    fixContainerStyle(sensor1) {
        // if (!this.valuesContainer.get_parent())
        //     return;
        // if (!this.sensorLabel1.get_parent())
        //     return;
        // if (!this.sensorLabel2.get_parent())
        //     return;
        const calculateStyle = () => {
            // let defaultStyle = 'font-size:11px;';
            // const fontSize = Config.get_int('headers-font-size');
            // if (fontSize)
            //     defaultStyle = `font-size:${fontSize}px;`;
            // if (this.sensorsNum === 1 || this.sensorsLayout === 'horizontal'){
            //     if(parseInt(sensor1) > 43){
            //       const iconStyle = 'margin-left:2px;';
            //       this.icon.style = iconStyle + 'color: red;';
            //       return fontSize ? defaultStyle : 'font-size:11px; color: red;';
            //     }
            //     else {
            //       const iconStyle = 'margin-left:2px;';
            //       this.icon.style = iconStyle;
            //       return fontSize ? defaultStyle : 'font-size:11px;';
            //     }
            // }
            // const superHeight = this.valuesContainer.get_parent()?.get_allocation_box()?.get_height() ?? 0;
            // let scaledHeight = superHeight / this.scaleFactor;
            // if (scaledHeight <= 20)
            //     return defaultStyle;
            // scaledHeight = Math.round(scaledHeight / 3);
            // if (fontSize && fontSize < scaledHeight)
            //     return defaultStyle;
            // return `font-size:${scaledHeight}px;`;
            // return (parseInt(sensor1) > 43 ) ? `font-size:11px; color: red;` : `font-size:11px;` ;
            if(parseInt(sensor1) > 65 ) {
                  const iconStyle = 'margin-left:2px;';
                  this.icon.style = iconStyle + 'color: red;';
              return `font-size:11px; color: red;`;
            }else {
                  const iconStyle = 'margin-left:2px;';
                  this.icon.style = iconStyle;
              return `font-size:11px;`;
            }
            
        };
        const style = calculateStyle();
        // if (this.sensorLabel1.style !== style || this.sensorLabel2.style !== style) {
            this.sensorLabel1.style = style;
            this.sensorLabel2.style = this.sensor2Style();
            // console.log(this.sensorLabel2.style);
            // this.sensorLabel1.queue_relayout();
            // this.sensorLabel2.queue_relayout();
            // this.valuesContainer.queue_relayout();
        // }
        // const sensor1Width = this.sensorLabel1.get_preferred_width(-1);
        // const width1 = sensor1Width ? sensor1Width[1] : 0;
        // this.maxWidths1.push(width1);
        // if (this.maxWidths1.length > Utils.sensorsMonitor.updateFrequency * 10)
        //     this.maxWidths1.shift();
        // const max1 = Math.max(...this.maxWidths1);
        // let max2 = 0;
        // if (this.sensorLabel2.visible) {
        //     const sensor2Width = this.sensorLabel2.get_preferred_width(-1);
        //     const width2 = sensor2Width ? sensor2Width[1] : 0;
        //     this.maxWidths2.push(width2);
        //     if (this.maxWidths2.length > Utils.sensorsMonitor.updateFrequency * 10)
        //         this.maxWidths2.shift();
        //     max2 = Math.max(...this.maxWidths2);
        // }
        // if (max1 + max2 === this.valuesContainer.width)
        //     return;
        // this.valuesContainer.set_width(max1 + max2);
    }

    sensor2Style() {

      const sensorsData = Utils.sensorsMonitor.getCurrentValue('sensorsData');
      let sensor2 = '-';
      if (Config.get_boolean('sensors-header-sensor2-show')) {
          const sensor2Source = Config.get_json('sensors-header-sensor2');
          const sensor2Digits = Config.get_int('sensors-header-sensor2-digits');
          sensor2 = this.applySource(sensorsData, sensor2Source, sensor2Digits);
      }
      else {
          sensor2 = '';
      }

      if(parseInt(sensor2) > 50 ) {
            const iconStyle = 'margin-left:2px;';
            this.icon.style = iconStyle + 'color: red;';
        return `font-size:11px; color: red;`;
      }else {
            const iconStyle = 'margin-left:2px;';
            this.icon.style = iconStyle;
        return `font-size:11px;`;
      }
    }

    update() {
        this.maxWidths1 = [];
        this.maxWidths2 = [];
        this.updateValues();
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
        Config.connect(this.tooltipMenu, 'changed::sensors-header-tooltip', () => {
            if (!Config.get_boolean('sensors-header-tooltip'))
                this.tooltipMenu.close(true);
        });
        Utils.sensorsMonitor.listen(this.tooltipMenu, 'sensorsData', () => {
            if (!Config.get_boolean('sensors-header-tooltip'))
                return;
            const values = [];
            const sensorsData = Utils.sensorsMonitor.getCurrentValue('sensorsData');
            if (sensorsData) {
                for (let sensorNum = 1; sensorNum <= 5; sensorNum++) {
                    const sensorSource = Config.get_json(`sensors-header-tooltip-sensor${sensorNum}`);
                    if (!sensorSource)
                        continue;
                    const sensorName = Config.get_string(`sensors-header-tooltip-sensor${sensorNum}-name`);
                    const sensorDigits = Config.get_int(`sensors-header-tooltip-sensor${sensorNum}-digits`);
                    const text = this.applySource(sensorsData, sensorSource, sensorDigits);
                    if (!text || text === '-')
                        continue;
                    if (sensorName)
                        values.push(sensorName + ': ' + text);
                    else
                        values.push(text);
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
        if (!Config.get_boolean('sensors-header-tooltip'))
            return;
        this.tooltipMenu.open(false);
    }
    hideTooltip() {
        if (!this.tooltipMenu)
            return;
        if (!Config.get_boolean('sensors-header-tooltip'))
            return;
        this.tooltipMenu.close(false);
    }
    destroy() {
        Config.clear(this);
        Utils.sensorsMonitor.unlisten(this);
        Config.clear(this.icon);
        if (this.valuesContainer) {
            Config.clear(this.valuesContainer);
            Utils.sensorsMonitor.unlisten(this.valuesContainer);
        }
        if (this.tooltipMenu) {
            Config.clear(this.tooltipMenu);
            Utils.sensorsMonitor.unlisten(this.tooltipMenu);
            this.tooltipMenu.close(false);
        }
        super.destroy();
    }
});

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
import BarsBase from '../bars.js';
import Config from '../config.js';
import Sound from '../utils/sound.js';
export default GObject.registerClass(class MemoryBars extends BarsBase {
    constructor(params) {

        // if(params.header == true) {
        //     params.layout = 'horizontal';
        //     params.width = 80;
        //     // params.header = true;
        //     params.height = 1;
        // }

        if (params.layers === undefined)
            params.layers = 2;
        super(params);
        Config.connect(this, 'changed::memory-header-bars-color1', this.setStyle.bind(this));
        Config.connect(this, 'changed::memory-header-bars-color2', this.setStyle.bind(this));
        Config.connect(this, 'changed::memory-header-bars-color3', this.setStyle.bind(this));
    }
    setStyle() {
        super.setStyle();
        this.colors = [
            Config.get_string('memory-header-bars-color1') ?? 'rgba(29,172,214,1.0)',
            Config.get_string('memory-header-bars-color2') ?? 'rgba(29,172,214,0.3)',
            'rgba(29,172,214,1.0)',
            'rgba(34,163,105,1.0)',
            'rgba(172,179,52,1.0)',
            'rgba(250,183,51,1.0)',
            'rgba(255,142,21,1.0)',
            'rgba(255,78,17,1.0)',
            'rgba(255,13,13,1.0)',
        ];
    }
    setUsage(usage) {
        if (!usage || !Array.isArray(usage) || usage.length === 0) {
            this.updateBars([]);
            return;
        }
        const values = [];
        for (let i = 0; i < usage.length; i++) {
            if (!this.breakdownConfig || Config.get_boolean(this.breakdownConfig)) {
                const total = usage[i].total;
                const used = usage[i].used / total;
                const allocated = (usage[i].allocated - usage[i].used) / total;
                values.push([
                    { color: 0, value: used },
                    { color: 1, value: allocated },
                ]);
            }
            else {
                const usagePercent = (usage[i].used / usage[i].total) * 100;

                // if(percentUsed < 90){ 
                //   values.push([{ color: 0, value: usage[i].used / usage[i].total }]);
                // } else {
                //   values.push([{ color: 2, value: usage[i].used / usage[i].total }]);
                // }
                if(usagePercent <= 50){ 
                  values.push([{ color: 3, value: usage[i].used / usage[i].total }]);
                } else if(usagePercent <= 60) {
                  values.push([{ color: 3, value: usage[i].used / usage[i].total }]);
                } else if(usagePercent <= 80) {
                  values.push([{ color: 3, value: usage[i].used / usage[i].total }]);
                } else if(usagePercent <= 85) {
                  values.push([{ color: 3, value: usage[i].used / usage[i].total }]);
                } else if(usagePercent <= 90) {
                  values.push([{ color: 6, value: usage[i].used / usage[i].total }]);
                } else if(usagePercent <= 95) {
                  values.push([{ color: 7, value: usage[i].used / usage[i].total }]);
                } else if(usagePercent <= 100) {
                  Sound.playError();
                  values.push([{ color: 8, value: usage[i].used / usage[i].total }]);
                }

                // values.push([{ color: 0, value: usage[i].used / usage[i].total }]);
            }
        }
        this.updateBars(values);
    }
});


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
export default GObject.registerClass(class SensorBars extends BarsBase {
    constructor(params) {
      
        // if(params.header == true) {
        //     params.numBars = 3;
        //     params.layout = 'horizontal';
        //     params.width = 375;
        //     params.height = 1.25;
        // }

        if (params.layers === undefined)
            params.layers = 2;
        super(params);
        Config.connect(this, 'changed::processor-header-bars-color1', this.setStyle.bind(this));
        Config.connect(this, 'changed::processor-header-bars-color2', this.setStyle.bind(this));
    }
    setStyle() {
        super.setStyle();
        this.colors = [
            Config.get_string('processor-header-bars-color1') ?? 'rgba(29,172,214,1.0)',
            Config.get_string('processor-header-bars-color2') ?? 'rgba(214,29,29,1.0)',
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
                values.push([
                    { color: 0, value: usage[i].user / 100.0 },
                    { color: 1, value: (usage[i].total - usage[i].user) / 100.0 },
                ]);
            }
            else {
                const usagePercent = usage[i].total;

                if(usagePercent <= 55){ 
                  values.push([{ color: 3, value: usage[i].total / 100.0 }]);
                } else if(usagePercent <= 60) {
                  values.push([{ color: 5, value: usage[i].total / 100.0 }]);
                } else if(usagePercent <= 65) {
                  values.push([{ color: 6, value: usage[i].total / 100.0 }]);
                } else if(usagePercent <= 70) {
                  values.push([{ color: 7, value: usage[i].total / 100.0 }]);
                } else if(usagePercent <= 80) {
                  values.push([{ color: 8, value: usage[i].total / 100.0 }]);
                } else if(usagePercent <= 100) {
                  values.push([{ color: 8, value: usage[i].total / 100.0 }]);
                }
                  // values.push([{ color: 0, value: usage[i].total / 100.0 }]);
            }
        }
        this.updateBars(values);
    }
});

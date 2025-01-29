// Copyright (C) 2024 Todd Kulesza <todd@dropline.net>
// This file is part of TopHat.
// TopHat is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// TopHat is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
// You should have received a copy of the GNU General Public License
// along with TopHat. If not, see <https://www.gnu.org/licenses/>.
import GObject from 'gi://GObject';
import Cogl from 'gi://Cogl';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import { adjustAnimationTime } from 'resource:///org/gnome/shell/misc/animationUtils.js';
export const AnimationDuration = 200;
export var Orientation;
(function (Orientation) {
    Orientation[Orientation["Horizontal"] = 0] = "Horizontal";
    Orientation[Orientation["Vertical"] = 1] = "Vertical";
})(Orientation || (Orientation = {}));
export const TopHatMeter = GObject.registerClass(class TopHatMeter extends St.BoxLayout {
    bars;
    barUsage;
    orientation;
    scaleFactor = 1;
    color;
    barWidth; // in pixels
    constructor() {
        super({
            style_class: 'tophat-meter',
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
            name: 'TopHatMeter',
        });
        this.bars = new Array(0);
        this.barUsage = new Array(0);
        this.orientation = Orientation.Horizontal;
        this.color = new Cogl.Color();
        this.barWidth = 8;
        const themeContext = St.ThemeContext.get_for_stage(global.get_stage());
        this.scaleFactor = themeContext.get_scale_factor();
        themeContext.connect('notify::scale-factor', (obj) => {
            this.scaleFactor = obj.get_scale_factor();
            this.barWidth = this.computeBarWidth(this.bars.length);
            for (const b of this.bars) {
                b.set_width(this.barWidth);
            }
        });
        this.connect('notify::height', () => {
            this.setBarSizes(this.barUsage);
        });
    }
    getNumBars() {
        return this.bars.length;
    }
    setNumBars(n) {
        this.remove_all_children();
        for (const b of this.bars) {
            b.destroy();
        }
        this.bars = new Array(n);
        this.barUsage = new Array(n);
        this.barWidth = this.computeBarWidth(n);
        for (let i = 0; i < n; i++) {
            this.bars[i] = new St.Widget({
                y_align: Clutter.ActorAlign.END,
                y_expand: false,
                style_class: 'meter-bar',
                width: this.barWidth,
                height: 1 * this.scaleFactor,
                background_color: this.color,
                name: 'TopHatMeterBar',
            });
            this.add_child(this.bars[i]);
            this.barUsage[i] = 0;
        }
    }
    computeBarWidth(n, wasVertical = false) {
        let width = 8;
        if (wasVertical) {
            // If we're in vertical panel mode, use narrower widths
            if (n > 12) {
                n = 1;
            }
            else if (n > 9) {
                n = 2;
            }
            else if (n > 6) {
                width = 4;
            }
            else if (n > 2) {
                width = 6;
            }
        }
        else {
            if (n > 8) {
                width = 4; // Reduce bar width by half when there are many bars
            }
            else if (n > 4) {
                width = 6; // Reduce bar width by 3/4 when there are a few bars
            }
        }
        return width * this.scaleFactor;
    }
    setOrientation(o) {
        this.orientation = o;
    }
    setBarSizes(n) {
        if (n.length != this.bars.length) {
            console.warn(`[TopHat] called setBarSizes() with ${n.length} values for ${this.bars.length} bars`);
        }
        const meterHeight = this.get_height() - 2 * this.scaleFactor; // Subtract margin of 1px
        const duration = adjustAnimationTime(AnimationDuration);
        for (let i = 0; i < n.length; i++) {
            const height = Math.ceil(meterHeight * n[i]);
            const curHeight = this.bars[i].height;
            // console.log(
            //   `meter: curHeight=${curHeight} height=${height} (meterHeight=${meterHeight} * usage=${n[i]})`
            // );
            const delta = Math.abs(height - curHeight);
            this.bars[i].remove_transition('scaleHeight');
            if (duration > 0 && delta > 2) {
                const t = Clutter.PropertyTransition.new_for_actor(this.bars[i], 'height');
                t.set_duration(duration);
                t.set_from(curHeight);
                t.set_to(height);
                t.set_remove_on_complete(true);
                this.bars[i].add_transition('scaleHeight', t);
                t.start();
            }
            else {
                this.bars[i].set_height(height);
            }
            // cache this in case we need to re-scale the meter
            this.barUsage[i] = n[i];
        }
    }
    setColor(c) {
        let ok;
        let color;
        if (Cogl.color_from_string) {
            [ok, color] = Cogl.color_from_string(c);
        }
        else {
            // GNOME 46 and earlier
            // @ts-expect-error property does not exist
            [ok, color] = Clutter.color_from_string(c);
        }
        if (!ok) {
            console.warn(`Error parsing ${c} to Cogl.Color`);
            return;
        }
        if (this.color === color) {
            return;
        }
        this.color = color;
        for (const bar of this.bars) {
            bar.set_background_color(this.color);
        }
    }
    reorient() {
        // This is to play nice with the dash-to-panel extension
        const wasVertical = this.vertical;
        this.set_vertical(false);
        this.set_x_expand(false);
        this.set_x_align(Clutter.ActorAlign.CENTER);
        this.set_y_align(Clutter.ActorAlign.CENTER);
        this.barWidth = this.computeBarWidth(this.bars.length, wasVertical);
        for (const b of this.bars) {
            b.set_width(this.barWidth);
        }
        for (let i = 0; i < this.bars.length; i++) {
            let style = '';
            if (i === this.bars.length - 1) {
                style += 'margin:0;';
            }
            else {
                style += 'margin:0 1px 0 0;';
            }
            this.bars[i].set_style(style);
        }
    }
    destroy() {
        for (const b of this.bars) {
            b.destroy();
        }
        this.bars.length = 0;
        super.destroy();
    }
});

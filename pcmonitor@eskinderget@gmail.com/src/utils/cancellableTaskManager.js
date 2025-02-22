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
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
export default class CancellableTaskManager {
    constructor() {
        this.taskCancellable = new Gio.Cancellable();
    }
    run(boundTask) {
        if (this.currentTask)
            this.currentTask.cancel();
        this.currentTask = this.makeCancellable(boundTask);
        return this.currentTask.promise.finally(() => {
            if (this.currentTask)
                this.currentTask = undefined;
            if (this.cancelId)
                this.taskCancellable.disconnect(this.cancelId);
            this.cancelId = undefined;
        });
    }
    setSubprocess(subprocess) {
        this.cancelId = this.taskCancellable.connect(() => {
            subprocess.force_exit();
        });
    }
    makeCancellable(boundTask) {
        let rejectFn;
        let timeoutId;
        const promise = new Promise((resolve, reject) => {
            rejectFn = reject;
            timeoutId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                timeoutId = undefined;
                boundTask().then(resolve).catch(reject);
                return GLib.SOURCE_REMOVE;
            });
        });
        const cancel = () => {
            if (this.cancelId) {
                this.taskCancellable.cancel();
                this.taskCancellable.disconnect(this.cancelId);
                this.taskCancellable = new Gio.Cancellable();
                this.cancelId = undefined;
            }
            if (timeoutId) {
                GLib.source_remove(timeoutId);
                timeoutId = undefined;
            }
            rejectFn({ isCancelled: true, message: 'Task cancelled' });
        };
        return { promise, cancel };
    }
    cancel() {
        if (this.currentTask) {
            this.currentTask.cancel();
        }
    }
    get isRunning() {
        return !!this.currentTask;
    }
    get cancellable() {
        return this.taskCancellable;
    }
}

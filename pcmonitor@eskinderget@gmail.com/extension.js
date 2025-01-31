import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import PcMonitorContainer from './src/container.js';
import Utils from './src/utils/utils.js';
import ProcessorMonitor from './src/processor/processorMonitor.js';
import GpuMonitor from './src/gpu/gpuMonitor.js';
import MemoryMonitor from './src/memory/memoryMonitor.js';
import StorageMonitor from './src/storage/storageMonitor.js';
import NetworkMonitor from './src/network/networkMonitor.js';
import SensorsMonitor from './src/sensors/sensorsMonitor.js';
export default class PcMonitorExtension extends Extension {
    constructor() {
        super(...arguments);
        this.timeout = 0;
    }
    enable() {
        Utils.init({
            service: 'astra-monitor',
            extension: this,
            metadata: this.metadata,
            settings: this.getSettings(),
            ProcessorMonitor,
            GpuMonitor,
            MemoryMonitor,
            StorageMonitor,
            NetworkMonitor,
            SensorsMonitor,
        });
        Utils.log('AstraMonitor enabled');
        this.container = new PcMonitorContainer();
        this.timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Utils.startupDelay * 1000, () => {
            if (this.container)
                this.container.place(this.uuid);
            this.timeout = 0;
            Utils.ready = true;
            return false;
        });
    }
    disable() {
        Utils.log('AstraMonitor disabled');
        Utils.ready = false;
        if (this.timeout !== 0) {
            GLib.source_remove(this.timeout);
            this.timeout = 0;
        }
        try {
            this.container?.destroy();
        }
        catch (e) {
            Utils.error('Error destroying container', e);
        }
        this.container = undefined;
        Utils.clear();
    }
}

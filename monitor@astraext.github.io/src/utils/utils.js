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
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Config from '../config.js';
import Signal from '../signal.js';
import CommandSubprocess from './commandSubprocess.js';
import CommandHelper from './commandHelper.js';
import XMLParser from './xmlParser.js';
class Utils {
    static init({ service, extension, metadata, settings, ProcessorMonitor, GpuMonitor, MemoryMonitor, StorageMonitor, NetworkMonitor, SensorsMonitor, }) {
        if (extension)
            Utils.extension = extension;
        Utils.metadata = metadata;
        Config.settings = settings;
        Utils.xmlParser = new XMLParser();
        Utils.commandsPath = new Map();
        Utils.debug = Config.get_boolean('debug-mode');
        if (Utils.debug && service === 'astra-monitor') {
            Utils.performanceMap = new Map();
            try {
                const log = Utils.getLogFile();
                if (log) {
                    if (log.query_exists(null))
                        log.delete(null);
                    log.create_readwrite(Gio.FileCreateFlags.REPLACE_DESTINATION, null);
                }
            }
            catch (e) {
                console.error(e);
            }
        }
        Utils.configUpdateFixes();
        if (ProcessorMonitor)
            Utils.processorMonitor = new ProcessorMonitor();
        if (GpuMonitor)
            Utils.gpuMonitor = new GpuMonitor();
        if (MemoryMonitor)
            Utils.memoryMonitor = new MemoryMonitor();
        if (StorageMonitor)
            Utils.storageMonitor = new StorageMonitor();
        if (NetworkMonitor)
            Utils.networkMonitor = new NetworkMonitor();
        if (SensorsMonitor)
            Utils.sensorsMonitor = new SensorsMonitor();
        Utils.getCachedHwmonDevicesAsync();
        Utils.initializeGTop();
        const updateExplicitZero = () => (Utils.explicitZero = Config.get_boolean('explicit-zero'));
        Config.connect(this, 'changed::explicit-zero', updateExplicitZero);
        updateExplicitZero();
        const updateExperimentalPsSubprocess = () => {
            const features = Config.get_json('experimental-features');
            Utils.experimentalPsSubprocess = features?.includes('ps_subprocess') ?? false;
        };
        Config.connect(this, 'changed::experimental-features', updateExperimentalPsSubprocess);
        updateExperimentalPsSubprocess();
    }
    static clear() {
        for (const task of Utils.lowPriorityTasks) {
            try {
                GLib.source_remove(task);
            }
            catch (e) {
                Utils.warn('Error removing lowPriorityTask', e instanceof Error ? e : undefined);
            }
        }
        Utils.lowPriorityTasks = [];
        for (const task of Utils.timeoutTasks) {
            try {
                GLib.source_remove(task);
            }
            catch (e) {
                Utils.warn('Error removing timeoutTask', e instanceof Error ? e : undefined);
            }
        }
        Utils.timeoutTasks = [];
        try {
            Config.clearAll();
        }
        catch (e) {
            Utils.error('Error clearing config', e);
        }
        try {
            Signal.clearAll();
        }
        catch (e) {
            Utils.error('Error clearing signal', e);
        }
        try {
            Utils.processorMonitor?.stop();
            Utils.processorMonitor?.destroy();
            Utils.gpuMonitor?.stop();
            Utils.gpuMonitor?.destroy();
            Utils.memoryMonitor?.stop();
            Utils.memoryMonitor?.destroy();
            Utils.storageMonitor?.stop();
            Utils.storageMonitor?.destroy();
            Utils.networkMonitor?.stop();
            Utils.networkMonitor?.destroy();
            Utils.sensorsMonitor?.stop();
            Utils.sensorsMonitor?.destroy();
        }
        catch (e) {
            Utils.error('Error stopping or destroying monitor', e);
        }
        Utils.xmlParser = null;
        Utils.performanceMap = null;
        Utils.commandsPath = null;
        Utils.lspciCached = undefined;
        Utils.lastCachedHwmonDevices = 0;
        Utils.cachedHwmonDevices = undefined;
        Utils.processorMonitor = undefined;
        Utils.gpuMonitor = undefined;
        Utils.memoryMonitor = undefined;
        Utils.storageMonitor = undefined;
        Utils.networkMonitor = undefined;
        Utils.sensorsMonitor = undefined;
        Utils.extension = undefined;
        Utils.metadata = undefined;
        Config.settings = undefined;
        if (Utils.uptimeTimer) {
            try {
                GLib.source_remove(Utils.uptimeTimer);
                Utils.uptimeTimer = 0;
            }
            catch (e) {
                Utils.warn('Error removing uptime timer', e instanceof Error ? e : undefined);
            }
        }
    }
    static async initializeGTop() {
        try {
            const res = await import('gi://GTop');
            Utils.GTop = res.default;
        }
        catch (e) {
            Utils.GTop = false;
        }
    }
    static get logHeader() {
        if (!Utils.metadata)
            return '';
        if (Utils.debug)
            return '###### ' + (Utils.metadata.name ?? '') + ' ######';
        return Utils.metadata.name ?? '';
    }
    static log(message) {
        if (Utils.debug) {
            console.log(Utils.logHeader + ' ' + message);
            Utils.logToFile(message);
        }
    }
    static verbose(message) {
        if (Utils.debug) {
            Utils.logToFile(message);
        }
    }
    static warn(message, error) {
        if (error === undefined)
            error = new Error();
        console.warn(error, Utils.logHeader + ' WARNING: ' + message);
        if (Utils.debug) {
            Utils.logToFile('WARNING: ' + message);
            Utils.logToFile(error.message);
            Utils.logToFile(error.stack ?? '');
        }
    }
    static error(message, error) {
        if (error === undefined)
            error = new Error();
        console.error(error, Utils.logHeader + ' ERROR: ' + message);
        if (Utils.debug) {
            Utils.logToFile('ERROR: ' + message);
            Utils.logToFile(error.message);
            Utils.logToFile(error.stack ?? '');
        }
    }
    static getLogFile() {
        try {
            const dataDir = GLib.get_user_cache_dir();
            const destination = GLib.build_filenamev([dataDir, 'astra-monitor', 'debug.log']);
            const destinationFile = Gio.File.new_for_path(destination);
            if (destinationFile &&
                GLib.mkdir_with_parents(destinationFile.get_parent().get_path(), 0o755) === 0)
                return destinationFile;
        }
        catch (e) {
            console.error(e);
        }
        return null;
    }
    static logToFile(message) {
        const log = Utils.getLogFile();
        if (log) {
            try {
                const date = new Date();
                const time = date.toISOString().split('T')[1].slice(0, -1);
                const outputStream = log.append_to(Gio.FileCreateFlags.NONE, null);
                const buffer = new TextEncoder().encode(`${time} - ${message}\n`);
                outputStream.write_all(buffer, null);
            }
            catch (e) {
                console.error(e);
            }
        }
    }
    static get startupDelay() {
        const delay = Config.get_double('startup-delay');
        if (Number.isNaN(delay) || delay < 1 || delay > 10)
            return 2;
        return delay;
    }
    static get themeStyle() {
        if (Config.get_string('theme-style') === 'light')
            return 'light';
        return 'dark';
    }
    static get zeroStr() {
        return Utils.explicitZero ? '0' : '-';
    }
    static getMonitorsOrder() {
        let monitors = Config.get_json('monitors-order');
        if (!monitors)
            monitors = [];
        if (monitors.length < Utils.defaultMonitors.length) {
            for (const monitor of Utils.defaultMonitors) {
                if (!monitors.includes(monitor))
                    monitors.push(monitor);
            }
            Config.set('monitors-order', JSON.stringify(monitors), 'string');
        }
        return monitors;
    }
    static getIndicatorsOrder(category) {
        let indicators = Config.get_json(category + '-indicators-order');
        if (!indicators)
            indicators = [];
        if (indicators.length < Utils.defaultIndicators[category].length) {
            for (const indicator of Utils.defaultIndicators[category]) {
                if (!indicators.includes(indicator))
                    indicators.push(indicator);
            }
            Config.set(category + '-indicators-order', JSON.stringify(indicators), 'string');
        }
        return indicators;
    }
    static commandPathLookup(fullCommand) {
        const [command, ..._args] = fullCommand.split(' ');
        if (Utils.commandsPath.has(command)) {
            return Utils.commandsPath.get(command) ?? false;
        }
        for (const path of [
            '',
            '/bin/',
            '/usr/bin/',
            '/sbin/',
            '/usr/sbin/',
            '/usr/local/bin/',
            '/usr/local/sbin/',
            '/opt/',
            '/opt/bin/',
            '/opt/sbin/',
        ]) {
            try {
                const fullPath = path + command;
                const program = GLib.find_program_in_path(fullPath);
                if (program) {
                    Utils.commandsPath.set(command, path);
                    return path;
                }
                if (GLib.file_test(fullPath, GLib.FileTest.IS_EXECUTABLE)) {
                    Utils.commandsPath.set(command, path);
                    return path;
                }
                const [result, stdout, stderr] = GLib.spawn_command_line_sync(path + fullCommand);
                if (result && stdout && (!stderr || !stderr.length)) {
                    Utils.commandsPath.set(command, path);
                    return path;
                }
            }
            catch (e) {
            }
        }
        return false;
    }
    static hasProcStat() {
        try {
            const fileContents = GLib.file_get_contents('/proc/stat');
            return fileContents && fileContents[0];
        }
        catch (e) {
            return false;
        }
    }
    static hasProcCpuinfo() {
        try {
            const fileContents = GLib.file_get_contents('/proc/cpuinfo');
            return fileContents && fileContents[0];
        }
        catch (e) {
            return false;
        }
    }
    static hasProcMeminfo() {
        try {
            const fileContents = GLib.file_get_contents('/proc/meminfo');
            return fileContents && fileContents[0];
        }
        catch (e) {
            return false;
        }
    }
    static hasProcDiskstats() {
        try {
            const fileContents = GLib.file_get_contents('/proc/diskstats');
            return fileContents && fileContents[0];
        }
        catch (e) {
            return false;
        }
    }
    static hasProcNetDev() {
        try {
            const fileContents = GLib.file_get_contents('/proc/net/dev');
            return fileContents && fileContents[0];
        }
        catch (e) {
            return false;
        }
    }
    static hasLmSensors() {
        return Utils.commandPathLookup('sensors -v') !== false;
    }
    static hasHwmon() {
        try {
            const hwmonDir = Gio.File.new_for_path('/sys/class/hwmon');
            if (!hwmonDir.query_exists(null))
                return false;
            const hwmonEnum = hwmonDir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
            if (!hwmonEnum)
                return false;
            return hwmonEnum.next_file(null) !== null;
        }
        catch (e) {
            return false;
        }
    }
    static hasLscpu() {
        return Utils.commandPathLookup('lscpu -V') !== false;
    }
    static hasLspci() {
        return Utils.commandPathLookup('lspci --version') !== false;
    }
    static hasLsblk() {
        return Utils.commandPathLookup('lsblk -V') !== false;
    }
    static hasNethogs() {
        Utils.nethogsHasCaps();
        return Utils.commandPathLookup('nethogs -V') !== false;
    }
    static hasIp() {
        return Utils.commandPathLookup('ip -V') !== false;
    }
    static hasIw() {
        return Utils.commandPathLookup('iw --version') !== false;
    }
    static hasIwconfig() {
        return Utils.commandPathLookup('iwconfig --version') !== false;
    }
    static hasIotop() {
        return Utils.commandPathLookup('iotop --version') !== false;
    }
    static hasAMDGpu() {
        const gpus = Utils.getGPUsList();
        for (const gpu of gpus) {
            if (Utils.isAmdGpu(gpu))
                return true;
        }
        return false;
    }
    static hasNVidiaGpu() {
        const gpus = Utils.getGPUsList();
        for (const gpu of gpus) {
            if (Utils.isNvidiaGpu(gpu))
                return true;
        }
        return false;
    }
    static hasIntelGpu() {
        const gpus = Utils.getGPUsList();
        for (const gpu of gpus) {
            if (Utils.isIntelGpu(gpu))
                return true;
        }
        return false;
    }
    static isAmdGpu(gpu) {
        return gpu.vendorId === '1002';
    }
    static isNvidiaGpu(gpu) {
        return gpu.vendorId === '10de' || gpu.vendorId === '12d2';
    }
    static isIntelGpu(gpu) {
        return gpu.vendorId === '8086';
    }
    static canMonitorGpu(gpu) {
        if (Utils.isAmdGpu(gpu))
            return Utils.hasAmdGpuTop();
        if (Utils.isNvidiaGpu(gpu))
            return Utils.hasNvidiaSmi();
        return false;
    }
    static async hasGTop() {
        while (Utils.GTop === undefined) {
            await new Promise(r => {
                setTimeout(r, 100);
            });
        }
        return Utils.GTop !== false;
    }
    static filterLspciOutput(lspciOutput, keywords, op = 'or', collect = 1) {
        const lines = lspciOutput.split('\n');
        const keywordsLower = keywords.map(keyword => keyword.toLowerCase());
        const results = [];
        let collecting = 0;
        let result = [];
        for (let i = 0; i < lines.length; i++) {
            if (collecting === 0 && result.length > 0) {
                results.push(result.join('\n'));
                result = [];
            }
            if (collecting > 0) {
                result.push(lines[i]);
                collecting--;
                continue;
            }
            if (op === 'and') {
                let containsAll = true;
                for (const keyword of keywordsLower) {
                    if (!lines[i].toLowerCase().includes(keyword)) {
                        containsAll = false;
                        break;
                    }
                }
                if (!containsAll)
                    continue;
            }
            else {
                let containsAny = false;
                for (const keyword of keywordsLower) {
                    if (lines[i].toLowerCase().includes(keyword)) {
                        containsAny = true;
                        break;
                    }
                }
                if (!containsAny)
                    continue;
            }
            result.push(lines[i]);
            collecting = collect;
            collecting--;
        }
        return results;
    }
    static hasAmdGpuTop() {
        return Utils.commandPathLookup('amdgpu_top -V') !== false;
    }
    static hasRadeonTop() {
        return Utils.commandPathLookup('radeontop -v') !== false;
    }
    static hasNvidiaSmi() {
        return Utils.commandPathLookup('nvidia-smi -h') !== false;
    }
    static hasIntelGpuTop() {
        return Utils.commandPathLookup('intel_gpu_top -h') !== false;
    }
    static hasCoresFrequency() {
        let fileContents = GLib.file_get_contents('/sys/devices/system/cpu/present');
        if (fileContents && fileContents[0]) {
            const decoder = new TextDecoder('utf8');
            const topology = Utils.parseCpuPresentFile(decoder.decode(fileContents[1]));
            const paths = topology.map(coreId => `/sys/devices/system/cpu/cpu${coreId}/cpufreq/scaling_cur_freq`);
            try {
                for (const path of paths) {
                    fileContents = GLib.file_get_contents(path);
                    if (!fileContents || !fileContents[0])
                        return false;
                }
            }
            catch (e) {
                return false;
            }
            return true;
        }
        return false;
    }
    static hasPs() {
        try {
            const [result, stdout, stderr] = GLib.spawn_command_line_sync('ps -V');
            return result && !!stdout && (!stderr || !stderr.length);
        }
        catch (e) {
            return false;
        }
    }
    static formatBytesPerSec(value, unit, maxNumbers = 2, padded = false) {
        if (!Object.prototype.hasOwnProperty.call(Utils.unitMap, unit))
            unit = 'kB/s';
        if (!value || isNaN(value))
            return Utils.zeroStr + (padded ? '   ' : ' ') + Utils.unitMap[unit].labels[0];
        value *= Utils.unitMap[unit].mult;
        let unitIndex = 0;
        while (value >= Math.pow(10, maxNumbers) &&
            unitIndex < Utils.unitMap[unit].labels.length - 1) {
            value /= Utils.unitMap[unit].base;
            unitIndex++;
        }
        let result = value.toString();
        if (result.indexOf('.') !== -1) {
            const parts = result.split('.');
            if (parts[0].length >= maxNumbers)
                result = parts[0];
            else
                result = parts[0] + '.' + parts[1].substr(0, maxNumbers - parts[0].length);
        }
        else if (result.length > maxNumbers) {
            result = result.substr(0, maxNumbers);
        }
        return `${result} ${Utils.unitMap[unit].labels[unitIndex]}`;
    }
    static formatBytes(bytes, unit = 'kB-KB', maxNumbers = 2) {
        if (!Object.prototype.hasOwnProperty.call(Utils.unit2Map, unit))
            unit = 'kB-KB';
        if (!bytes || isNaN(bytes))
            return Utils.zeroStr + Utils.unit2Map[unit].labels[0];
        bytes *= Utils.unit2Map[unit].mult;
        let unitIndex = 0;
        while (bytes >= Math.pow(10, maxNumbers) &&
            unitIndex < Utils.unit2Map[unit].labels.length - 1) {
            bytes /= Utils.unit2Map[unit].base;
            unitIndex++;
        }
        let result = bytes.toString();
        if (result.indexOf('.') !== -1) {
            const parts = result.split('.');
            if (parts[0].length >= maxNumbers)
                result = parts[0];
            else
                result = parts[0] + '.' + parts[1].substr(0, maxNumbers - parts[0].length);
        }
        else if (result.length > maxNumbers) {
            result = result.substr(0, maxNumbers);
        }
        return `${result} ${Utils.unit2Map[unit].labels[unitIndex]}`;
    }
    static formatHugeNumber(value, unit = 'Q', maxNumbers = 4) {
        if (!Object.prototype.hasOwnProperty.call(Utils.unit3Map, unit))
            unit = 'Q';
        if (!value || isNaN(value))
            return Utils.zeroStr + Utils.unit3Map[unit].labels[0];
        let unitIndex = 0;
        while (value >= Math.pow(10, maxNumbers) &&
            unitIndex < Utils.unit3Map[unit].labels.length - 1) {
            value /= Utils.unit3Map[unit].base;
            unitIndex++;
        }
        let result = value.toString();
        if (result.indexOf('.') !== -1) {
            const parts = result.split('.');
            if (parts[0].length >= maxNumbers)
                result = parts[0];
            else
                result = parts[0] + '.' + parts[1].substr(0, maxNumbers - parts[0].length);
        }
        else if (result.length > maxNumbers) {
            result = result.substr(0, maxNumbers);
        }
        const finalUnit = Utils.unit3Map[unit].labels[unitIndex];
        if (finalUnit.length > 0)
            return `${result} ${finalUnit}`;
        return `${result}`;
    }
    static formatFrequency(frequency, unit = 'Hz', maxNumbers = 4, forceDecimals = false) {
        if (!Object.prototype.hasOwnProperty.call(Utils.unit4Map, unit))
            unit = 'Hz';
        if (!frequency || isNaN(frequency))
            return Utils.zeroStr + Utils.unit4Map[unit].labels[0];
        let unitIndex = 0;
        while (frequency >= Math.pow(10, maxNumbers) &&
            unitIndex < Utils.unit4Map[unit].labels.length - 1) {
            frequency /= Utils.unit4Map[unit].base;
            unitIndex++;
        }
        let result = frequency.toFixed(maxNumbers - 1);
        if (result.indexOf('.') !== -1) {
            const parts = result.split('.');
            if (parts[0].length >= maxNumbers && !forceDecimals) {
                result = parts[0];
            }
            else {
                const decimalPart = parts[1].substr(0, maxNumbers - parts[0].length);
                result = parts[0] + '.' + decimalPart.padEnd(maxNumbers - parts[0].length, '0');
            }
        }
        else if (forceDecimals) {
            result = result + '.' + '0'.repeat(maxNumbers - result.length);
        }
        return `${result} ${Utils.unit4Map[unit].labels[unitIndex]}`;
    }
    static convertToBytes(value, unit) {
        if (typeof value === 'string') {
            value = parseFloat(value);
            if (isNaN(value))
                return -1;
        }
        if (unit === 'B')
            return value;
        if (unit === 'kB' || unit === 'KB')
            return value * 1000;
        if (unit === 'MB')
            return value * 1000 * 1000;
        if (unit === 'GB')
            return value * 1000 * 1000 * 1000;
        if (unit === 'TB')
            return value * 1000 * 1000 * 1000 * 1000;
        if (unit === 'kiB' || unit === 'KiB')
            return value * 1024;
        if (unit === 'MiB')
            return value * 1024 * 1024;
        if (unit === 'GiB')
            return value * 1024 * 1024 * 1024;
        if (unit === 'TiB')
            return value * 1024 * 1024 * 1024 * 1024;
        if (unit === 'ki' || unit === 'Ki')
            return value * 1024;
        if (unit === 'Mi')
            return value * 1024 * 1024;
        if (unit === 'Gi')
            return value * 1024 * 1024 * 1024;
        if (unit === 'Ti')
            return value * 1024 * 1024 * 1024 * 1024;
        return value;
    }
    static async getCachedHwmonDevicesAsync() {
        if (Utils.hwmonPromise) {
            return Utils.hwmonPromise;
        }
        Utils.hwmonPromise = (async () => {
            try {
                const devices = await Utils.getHwmonDevices();
                Utils.lastCachedHwmonDevices = Date.now();
                Utils.cachedHwmonDevices = devices;
                return devices;
            }
            finally {
                Utils.hwmonPromise = null;
            }
        })();
        return Utils.hwmonPromise;
    }
    static getCachedHwmonDevices() {
        if (Utils.lastCachedHwmonDevices + 300000 < Date.now()) {
            Utils.lastCachedHwmonDevices = Date.now();
            Utils.getHwmonDevices().then(devices => {
                Utils.cachedHwmonDevices = devices;
            });
        }
        return Utils.cachedHwmonDevices;
    }
    static async getHwmonDevices() {
        const baseDir = '/sys/class/hwmon';
        const devices = new Map();
        try {
            const hwmons = await Utils.listDirAsync(baseDir, { folders: true, files: false });
            await Promise.all(hwmons.map(async (hwmonInfo) => {
                const hwmon = hwmonInfo.name;
                let name = await Utils.readFileAsync(`${baseDir}/${hwmon}/name`, true);
                if (!name)
                    return;
                name = name.trim();
                let addressAdded = false;
                let address = await Utils.readFileAsync(`${baseDir}/${hwmon}/device/address`, true);
                if (address) {
                    address = address.trim();
                    address = address.replace(/^0+:/, '');
                    address = address.replace(/\.[0-9]*$/, '');
                    address = address.replace(/:/g, '');
                    name = `${name}-{$${address}}`;
                    addressAdded = true;
                }
                if (!addressAdded) {
                    address = await Utils.readFileAsync(`${baseDir}/${hwmon}/device/device`, true);
                    if (address) {
                        address = address.trim();
                        address = address.replace(/^0x/, '');
                        name = `${name}-{$${address}}`;
                    }
                }
                const files = await Utils.listDirAsync(`${baseDir}/${hwmon}`, {
                    folders: false,
                    files: true,
                });
                const sensorPromises = files.map(async (file) => {
                    const fileName = file.name;
                    if (fileName === 'name' || fileName === 'uevent') {
                        return;
                    }
                    const prefix = Utils.sensorsPrefix.find(str => fileName.startsWith(str));
                    if (prefix) {
                        let sensorName = fileName.split('_')[0];
                        let attrName = fileName.split('_')[1];
                        if (attrName === 'label') {
                            return;
                        }
                        if (files.find(a => a.name === `${sensorName}_label`)) {
                            const label = await Utils.readFileAsync(`${baseDir}/${hwmon}/${sensorName}_label`, true);
                            if (label)
                                sensorName = label.trim();
                        }
                        let device = devices.get(name);
                        if (!device) {
                            device = new Map();
                            devices.set(name, device);
                        }
                        let sensor = device.get(sensorName);
                        if (!sensor) {
                            sensor = new Map();
                            device.set(sensorName, sensor);
                        }
                        if (attrName === '' || attrName === undefined)
                            attrName = 'value';
                        let attribute = sensor.get(attrName);
                        if (!attribute) {
                            attribute = {
                                type: prefix,
                                path: `${hwmon}/${fileName}`,
                            };
                            sensor.set(attrName, attribute);
                        }
                    }
                });
                await Promise.all(sensorPromises);
            }));
            const orderedDevices = new Map([...devices.entries()].sort());
            return orderedDevices;
        }
        catch (e) {
            Utils.error('Error getting hwmon devices', e);
            return new Map();
        }
    }
    static getSensorSources() {
        const sensors = [];
        try {
            const hwmonDevices = Utils.getCachedHwmonDevices();
            const deviceNames = [];
            for (const deviceName of hwmonDevices.keys())
                deviceNames.push(deviceName.split('-{$')[0]);
            for (const [deviceName, sensorsMap] of hwmonDevices) {
                for (const [sensorName, attributes] of sensorsMap) {
                    for (const [attrName, attr] of attributes) {
                        let deviceLabel;
                        const split = deviceName.split('-{$');
                        if (deviceNames.filter(name => name === split[0]).length === 1)
                            deviceLabel = Utils.capitalize(split[0]);
                        else
                            deviceLabel =
                                Utils.capitalize(split[0]) + ' - ' + split[1].replace(/}$/, '');
                        const sensorLabel = Utils.capitalize(sensorName);
                        const attrLabel = Utils.capitalize(attrName);
                        const type = Utils.capitalize(attr.type);
                        sensors.push({
                            value: {
                                service: 'hwmon',
                                path: [deviceName, sensorName, attrName],
                            },
                            text: `[hwmon] ${deviceLabel} -> ${sensorLabel} -> ${type} ${attrLabel}`,
                        });
                    }
                }
            }
            if (Utils.hasLmSensors()) {
                const path = Utils.commandPathLookup('sensors -v');
                const [_result, stdout, _stderr] = GLib.spawn_command_line_sync(`${path}sensors -j`);
                if (stdout && stdout.length > 0) {
                    const decoder = new TextDecoder('utf8');
                    let stdoutString = decoder.decode(stdout);
                    stdoutString = stdoutString.replace(/,\s*(?=}|])/g, '');
                    const parsedData = JSON.parse(stdoutString);
                    for (const sensorName in parsedData) {
                        for (const sensor in parsedData[sensorName]) {
                            if (sensor === 'Adapter')
                                continue;
                            for (const sensorData in parsedData[sensorName][sensor]) {
                                sensors.push({
                                    value: {
                                        service: 'sensors',
                                        path: [sensorName, sensor, sensorData],
                                    },
                                    text: `[lm-sensors] ${sensorName} -> ${sensor} -> ${sensorData}`,
                                });
                            }
                        }
                    }
                }
                else {
                    Utils.log('No sensor data found or sensors command failed');
                }
            }
        }
        catch (e) {
            Utils.log('Error getting sensors sources: ' + e);
        }
        return sensors;
    }
    static inferMeasurementUnit(key) {
        if (key.startsWith('temp'))
            return '°C';
        if (key.startsWith('fan'))
            return 'RPM';
        if (key.startsWith('in'))
            return 'V';
        if (key.startsWith('power'))
            return 'W';
        if (key.startsWith('curr'))
            return 'A';
        if (key.startsWith('energy'))
            return 'J';
        if (key.startsWith('pwm'))
            return '';
        if (key.startsWith('freq'))
            return 'MHz';
        return '';
    }
    static sensorsNameFormat(name) {
        return Utils.capitalize(name.replace(/_/g, ' '));
    }
    static isNumeric(value) {
        if (typeof value === 'number')
            return !isNaN(value);
        if (typeof value === 'string')
            return value.trim() !== '' && !isNaN(parseFloat(value)) && isFinite(parseFloat(value));
        return false;
    }
    static isIntOrIntString(value) {
        if (Number.isInteger(value))
            return true;
        if (typeof value === 'string') {
            const parsed = parseInt(value, 10);
            return parsed.toString() === value;
        }
        return false;
    }
    static celsiusToFahrenheit(celsius) {
        return celsius * 1.8 + 32;
    }
    static extractCommandName(cmdLine) {
        if (cmdLine.trim().startsWith('[') && cmdLine.trim().endsWith(']'))
            return cmdLine.trim();
        const sanitizedCmdLine = cmdLine.replace(/\u0000/g, ' ');
        const elements = sanitizedCmdLine.split(' ');
        const fullPath = elements[0];
        const pathParts = fullPath.split('/');
        const commandName = pathParts[pathParts.length - 1];
        return commandName.replace(/[\r\n]/g, '');
    }
    static parseSize(size) {
        const sizeRegex = /^([\d,.]+)([KMGTP]?)$/;
        const match = sizeRegex.exec(size);
        if (!match)
            return Number.NaN;
        const value = parseFloat(match[1].replace(',', '.'));
        const unit = match[2].toLowerCase();
        if (Number.isNaN(value))
            return Number.NaN;
        switch (unit) {
            case 'k':
                return Math.round(value * 1000);
            case 'm':
                return Math.round(value * 1000 * 1000);
            case 'g':
                return Math.round(value * 1000 * 1000 * 1000);
            case 't':
                return Math.round(value * 1000 * 1000 * 1000 * 1000);
            default:
                return value;
        }
    }
    static getCPUModelShortify(model) {
        model = model.replace(/\(R\)/g, '');
        model = model.replace(/\(TM\)/g, '');
        model = model.replace(/\(C\)/g, '');
        model = model.replace(/\s+/g, ' ');
        model = model.replace(/\b(\w+)\s+\1\b/g, '$1');
        model = model.trim();
        return model;
    }
    static getVendorName(vendorId) {
        const vendors = {
            '0x1002': ['AMD'],
            '0x10de': ['NVIDIA'],
            '0x8086': ['Intel'],
            '0x102b': ['Matrox'],
            '0x1039': ['SiS'],
            '0x5333': ['S3'],
            '0x1a03': ['ASPEED'],
            '0x80ee': ['Oracle', 'VirtualBox'],
            '0x1234': ['Bochs', 'QEMU'],
            '0x15ad': ['VMware'],
            '0x1414': ['Microsoft', 'HyperV'],
            '0x1013': ['Cirrus', 'Logic'],
            '0x12d2': ['NVIDIA'],
            '0x18ca': ['XGI'],
            '0x1de1': ['Tekram'],
        };
        return vendors[vendorId] || ['Unknown'];
    }
    static getGPUsList() {
        if (Utils.lspciCached)
            return Utils.lspciCached;
        Utils.lspciCached = [];
        if (!Utils.hasLspci())
            return Utils.lspciCached;
        try {
            const decoder = new TextDecoder('utf8');
            const path = Utils.commandPathLookup('lspci --version');
            const [result, stdout, stderr] = GLib.spawn_command_line_sync(`${path}lspci -nnk`);
            if (!result || !stdout) {
                if (!stderr)
                    throw new Error('Stream invalid');
                const lspciError = decoder.decode(stderr);
                Utils.error('Error getting GPUs list: ' + lspciError);
                return Utils.lspciCached;
            }
            const lspciOutput = decoder.decode(stdout);
            const filteredOutputs = Utils.filterLspciOutput(lspciOutput, ['vga', 'display controller', '3d controller'], 'or', 5);
            for (const filtered of filteredOutputs) {
                const lines = filtered.split('\n');
                for (let i = lines.length - 1; i >= 1; i--) {
                    if (lines[i].startsWith('\t'))
                        lines[i] = lines[i].substring(1);
                    else
                        lines.splice(i, lines.length - i);
                }
                let firstLine = lines[0];
                const addressRegex = /^((?:[0-9a-fA-F]{4}:)?[0-9a-fA-F]{2}):([0-9a-fA-F]{2})\.([0-9a-fA-F]) /;
                const addressMatch = addressRegex.exec(firstLine);
                if (!addressMatch) {
                    Utils.log('Error getting GPUs list: ' + firstLine + ' does not match address');
                    continue;
                }
                let domain = addressMatch[1];
                if (!domain.includes(':'))
                    domain = '0000:' + domain;
                const [bus, slot] = [addressMatch[2], addressMatch[3]];
                firstLine = firstLine.replace(addressRegex, '');
                const vendorLine = firstLine.split(':');
                if (vendorLine.length < 3) {
                    Utils.warn('Error getting GPUs list: ' + firstLine + ' does not match vendor');
                    continue;
                }
                vendorLine.shift();
                let vendor = vendorLine.join(':').trim();
                const regex = /\[([\da-fA-F]{4}):([\da-fA-F]{4})\]\s*/g;
                let match;
                let vendorId = null;
                let productId = null;
                if ((match = regex.exec(vendor)) !== null) {
                    vendorId = match[1];
                    productId = match[2];
                }
                vendor = vendor.replace(regex, '').trim();
                if (lines.length < 2) {
                    Utils.warn('Error getting GPUs list: lines length < 2');
                    continue;
                }
                const modelLine = lines[1].split(':');
                if (modelLine.length < 2) {
                    Utils.warn('Error getting GPUs list: model line missmatch');
                    continue;
                }
                modelLine.shift();
                let model = modelLine.join(':').trim();
                model = model.replace(regex, '').trim();
                let drivers = null;
                if (lines.length >= 3) {
                    const driverLine = lines[2].split(':');
                    if (driverLine.length >= 2) {
                        driverLine.shift();
                        drivers = driverLine
                            .join(':')
                            .split(',')
                            .map(line => line.trim());
                    }
                }
                let modules = null;
                if (lines.length >= 4) {
                    const moduleLine = lines[3].split(':');
                    if (moduleLine.length >= 2) {
                        moduleLine.shift();
                        modules = moduleLine
                            .join(':')
                            .split(',')
                            .map(line => line.trim());
                    }
                }
                const gpu = {
                    domain,
                    bus,
                    slot,
                    vendor,
                    model,
                };
                if (vendorId)
                    gpu.vendorId = vendorId;
                if (productId)
                    gpu.productId = productId;
                if (drivers)
                    gpu.drivers = drivers;
                if (modules)
                    gpu.modules = modules;
                Utils.lspciCached.push(gpu);
            }
        }
        catch (e) {
            Utils.log('Error getting GPUs list: ' + e.message);
        }
        return Utils.lspciCached;
    }
    static getGPUModelName(gpu) {
        let shortName = Utils.GPUModelShortify(gpu.model);
        const shortVendorName = Utils.GPUModelShortify(gpu.vendor);
        const vendorNames = Utils.getVendorName('0x' + gpu.vendorId);
        if (vendorNames[0] === 'Unknown')
            return shortName;
        if (shortVendorName.startsWith(shortName) && shortVendorName.length > shortName.length) {
            shortName = shortVendorName;
        }
        else if (shortName.length < 32) {
            const normalizedShortName = shortName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            if (!vendorNames.some(vendorName => normalizedShortName.includes(vendorName.toLowerCase()))) {
                const normalizedVendorName = shortVendorName
                    .replace(/[^a-zA-Z0-9]/g, '')
                    .toLowerCase();
                if (shortVendorName &&
                    vendorNames.some(vendorName => normalizedVendorName.includes(vendorName.toLowerCase()))) {
                    shortName = shortVendorName + ` [${shortName}]`;
                }
                else {
                    shortName = vendorNames.join(' / ') + ` ${shortName}`;
                }
            }
        }
        return shortName;
    }
    static GPUModelShortify(model) {
        model = model.replace(',', '');
        model = model.replace('(R)', '');
        model = model.replace('(TM)', '');
        model = model.replace('(C)', '');
        model = model.replace(/\bInc\./g, '');
        model = model.replace(/\bCorp\./g, '');
        model = model.replace(/\bCo\./g, '');
        model = model.replace(/\bCo\b/g, '');
        model = model.replace(/\bCorporation\b/g, '');
        model = model.replace(/\bIncorporated\b/g, '');
        model = model.replace(/\bLimited\b/g, '');
        model = model.replace(/\bLtd\b/g, '');
        model = model.replace(/\bCompany\b/g, '');
        model = model.replace(/\bInternational\b/g, '');
        model = model.replace(/\bGroup\b/g, '');
        model = model.replace(/\bTechnologies\b/g, '');
        model = model.replace(/\bTechnology\b/g, '');
        model = model.replace(/\bIntegrated Systems\b/g, '');
        model = model.replace(/\bComputers\b/g, '');
        model = model.replace(/\bComputer\b/g, '');
        model = model.replace(/\bElectronic\b/g, '');
        model = model.replace(/\bAdvanced Micro Devices\b/g, 'AMD');
        model = model.replace(/\bDevices\b/g, '');
        model = model.replace(/\bDevice\b/g, '');
        model = model.replace('[AMD/ATI]', '');
        model = model.replace(/\bASUSTeK\b/g, 'ASUS');
        model = model.replace(/\bHewlett-Packard\b/g, 'HP');
        model = model.replace(/\(rev\.?\s?\w+\)/g, '');
        model = model.replace(/\s+/g, ' ');
        model = model.replace(/\b(\w+)\s+\1\b/g, '$1');
        model = model.trim();
        return model;
    }
    static isSameGpu(gpu1, gpu2) {
        if (!gpu1 || !gpu2)
            return false;
        return (gpu1.domain === gpu2.domain &&
            gpu1.bus === gpu2.bus &&
            gpu1.slot === gpu2.slot &&
            gpu1.vendorId === gpu2.vendorId &&
            gpu1.productId === gpu2.productId);
    }
    static getMonitoredGPUs() {
        const gpusData = Config.get_json('gpu-data');
        if (!gpusData)
            return [];
        const gpus = Utils.getGPUsList();
        return gpusData.filter((gpuData) => gpus.some((gpu) => Utils.isSameGpu(gpu, gpuData)));
    }
    static getMainGPU() {
        const mainGpu = Config.get_json('gpu-main');
        if (!mainGpu)
            return undefined;
        const gpus = Utils.getGPUsList();
        for (const gpu of gpus) {
            if (Utils.isSameGpu(gpu, mainGpu))
                return gpu;
        }
        return undefined;
    }
    static getPCI(gpu) {
        if (!gpu)
            return '';
        return `${gpu.domain}:${gpu.bus}.${gpu.slot}`;
    }
    static getUptime(callback) {
        const syncTime = () => {
            if (Utils.uptimeTimer) {
                GLib.source_remove(Utils.uptimeTimer);
            }
            Utils.cachedUptimeSeconds = 0;
            try {
                const fileContents = GLib.file_get_contents('/proc/uptime');
                if (fileContents && fileContents[0]) {
                    const decoder = new TextDecoder('utf8');
                    const uptimeString = decoder.decode(fileContents[1]);
                    const uptimeSeconds = parseFloat(uptimeString.split(' ')[0]);
                    Utils.cachedUptimeSeconds = uptimeSeconds;
                }
            }
            catch (e) {
            }
            callback(Utils.cachedUptimeSeconds);
            Utils.uptimeTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                Utils.cachedUptimeSeconds += 1.0;
                callback(Utils.cachedUptimeSeconds);
                return true;
            });
        };
        syncTime();
        return {
            stop: () => {
                if (Utils.uptimeTimer) {
                    GLib.source_remove(Utils.uptimeTimer);
                    Utils.uptimeTimer = 0;
                }
            },
        };
    }
    static formatUptime(seconds) {
        const timeParts = {
            days: Math.floor(seconds / (3600 * 24)),
            hours: Math.floor((seconds % (3600 * 24)) / 3600),
            minutes: Math.floor((seconds % 3600) / 60),
            seconds: Math.floor(seconds % 60),
        };
        const formatPart = (value, isPadded) => isPadded ? value.toString().padStart(2, '0') : value.toString();
        let formattedTime = '';
        let shouldPad = false;
        if (timeParts.days > 0) {
            formattedTime += `${timeParts.days}d `;
            shouldPad = true;
        }
        if (timeParts.hours > 0 || shouldPad) {
            formattedTime += `${formatPart(timeParts.hours, shouldPad)}h `;
            shouldPad = true;
        }
        if (timeParts.minutes > 0 || shouldPad) {
            formattedTime += `${formatPart(timeParts.minutes, shouldPad)}m `;
            shouldPad = true;
        }
        formattedTime += `${formatPart(timeParts.seconds, shouldPad)}s`;
        return formattedTime.trim();
    }
    static capitalize(str, lower = true) {
        if (!str)
            return str;
        if (lower)
            str = str.toLowerCase();
        return str.replace(/\b[a-z]/g, letter => {
            return letter.toUpperCase();
        });
    }
    static listDisksSync() {
        const disks = new Map();
        if (!Utils.hasLsblk())
            return disks;
        try {
            const path = Utils.commandPathLookup('lsblk -V');
            const [_result, stdout, _stderr] = GLib.spawn_command_line_sync(`${path}lsblk -J -o ID,NAME,LABEL,MOUNTPOINTS,PATH`);
            if (stdout && stdout.length > 0) {
                const decoder = new TextDecoder('utf8');
                const stdoutString = decoder.decode(stdout);
                const parsedData = JSON.parse(stdoutString);
                const findDevice = (device) => {
                    if (Object.prototype.hasOwnProperty.call(device, 'children') &&
                        device.children &&
                        device.children.length > 0) {
                        for (const child of device.children)
                            findDevice(child);
                    }
                    else {
                        disks.set(device.id, device);
                    }
                };
                if (parsedData.blockdevices && parsedData.blockdevices.length > 0) {
                    for (const device of parsedData.blockdevices) {
                        findDevice(device);
                    }
                }
            }
            else {
                Utils.log('No disk data found or lsblk command failed');
            }
        }
        catch (e) {
            Utils.log('Error getting disk list sync: ' + e);
        }
        return disks;
    }
    static async listDisksAsync(task) {
        const disks = new Map();
        if (!Utils.hasLsblk())
            return disks;
        try {
            const path = Utils.commandPathLookup('lsblk -V');
            const result = await Utils.runAsyncCommand(`${path}lsblk -J -o ID,NAME,LABEL,MOUNTPOINTS,PATH`, task);
            if (result) {
                const parsedData = JSON.parse(result);
                const findDevice = (device) => {
                    if (Object.prototype.hasOwnProperty.call(device, 'children') &&
                        device.children &&
                        device.children.length > 0) {
                        for (const child of device.children)
                            findDevice(child);
                    }
                    else {
                        disks.set(device.id, device);
                    }
                };
                if (parsedData.blockdevices && parsedData.blockdevices.length > 0) {
                    for (const device of parsedData.blockdevices) {
                        findDevice(device);
                    }
                }
            }
            else {
                Utils.error('No disk data found or lsblk command failed');
            }
        }
        catch (e) {
            Utils.error('Error getting disk list async: ' + e, e);
        }
        return disks;
    }
    static findDefaultDisk(disks) {
        for (const [id, disk] of disks.entries()) {
            if (disk.mountpoints &&
                Array.isArray(disk.mountpoints) &&
                disk.mountpoints.length > 0 &&
                disk.mountpoints.includes('/')) {
                return id;
            }
        }
        if (disks.size > 0)
            return disks.keys().next().value || null;
        return null;
    }
    static movingAverage(values, size) {
        const smoothedPoints = new Array(values.length);
        let sum = 0;
        let count = 0;
        let avg;
        for (let i = 0; i < values.length; i++) {
            const value = values[i];
            sum += value;
            count++;
            if (i >= size) {
                sum -= values[i - size];
            }
            else {
                avg = sum / count;
                smoothedPoints[i] = avg;
                continue;
            }
            avg = sum / size;
            smoothedPoints[i] = avg;
        }
        return smoothedPoints;
    }
    static movingAveragePoints(points, size) {
        const smoothedPoints = new Array(points.length);
        let sum = 0;
        let count = 0;
        let avg;
        for (let i = 0; i < points.length; i++) {
            const point = points[i][1];
            sum += point;
            count++;
            if (i >= size) {
                sum -= points[i - size][1];
            }
            else {
                avg = sum / count;
                smoothedPoints[i] = [points[i][0], avg];
                continue;
            }
            avg = sum / size;
            smoothedPoints[i] = [points[i][0], avg];
        }
        return smoothedPoints;
    }
    static readDirAsync(path) {
        return new Promise((resolve, reject) => {
            if (!path || typeof path !== 'string') {
                reject(new Error('Invalid directory path'));
                return;
            }
            let dir;
            try {
                dir = Gio.File.new_for_path(path);
            }
            catch (e) {
                reject(new Error(`Error creating directory object: ${e.message}`));
                return;
            }
            dir.enumerate_children_async('standard::name', Gio.FileQueryInfoFlags.NONE, 0, null, (sourceObject, result) => {
                if (!sourceObject) {
                    reject(new Error('Source object invalid'));
                    return;
                }
                try {
                    const enumerator = sourceObject.enumerate_children_finish(result);
                    let fileInfo;
                    const files = [];
                    while ((fileInfo = enumerator.next_file(null)) !== null) {
                        const name = fileInfo.get_name();
                        files.push(name);
                    }
                    resolve(files);
                }
                catch (e) {
                    reject(new Error(`Error reading directory: ${e.message}`));
                }
            });
        });
    }
    static listDirAsync(path, options = { folders: true, files: true }) {
        return new Promise((resolve, reject) => {
            if (!path || typeof path !== 'string') {
                reject(new Error('Invalid directory path'));
                return;
            }
            let dir;
            try {
                dir = Gio.File.new_for_path(path);
            }
            catch (e) {
                reject(new Error(`Error creating directory object: ${e.message}`));
                return;
            }
            dir.enumerate_children_async('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, 0, null, (sourceObject, result) => {
                if (!sourceObject) {
                    reject(new Error('Source object invalid'));
                    return;
                }
                try {
                    const enumerator = sourceObject.enumerate_children_finish(result);
                    let fileInfo;
                    const files = [];
                    while ((fileInfo = enumerator.next_file(null)) !== null) {
                        const type = fileInfo.get_file_type();
                        const isFolder = type === Gio.FileType.DIRECTORY;
                        if (options.folders === false && isFolder)
                            continue;
                        if (options.files === false && !isFolder)
                            continue;
                        const name = fileInfo.get_name();
                        files.push({ name, isFolder });
                    }
                    resolve(files);
                }
                catch (e) {
                    reject(new Error(`Error reading directory: ${e.message}`));
                }
            });
        });
    }
    static checkFolderExists(path) {
        try {
            const file = Gio.File.new_for_path(path);
            return file.query_exists(null);
        }
        catch (e) {
            return false;
        }
    }
    static readFileAsync(path, emptyOnFail = false, encoding = 'utf8') {
        return new Promise((resolve, reject) => {
            if (!path || typeof path !== 'string') {
                if (emptyOnFail)
                    resolve('');
                else
                    reject(new Error('Invalid file path'));
                return;
            }
            let file;
            try {
                file = Gio.File.new_for_path(path);
            }
            catch (e) {
                if (emptyOnFail)
                    resolve('');
                else
                    reject(new Error(`Error creating file object: ${e.message}`));
                return;
            }
            file.load_contents_async(null, (sourceObject, res) => {
                if (!sourceObject) {
                    reject(new Error('Source object invalid'));
                    return;
                }
                try {
                    const [success, fileContent] = sourceObject.load_contents_finish(res);
                    if (!success) {
                        if (emptyOnFail)
                            resolve('');
                        else
                            reject(new Error('Failed to read file'));
                        return;
                    }
                    if (fileContent.length === 0) {
                        if (emptyOnFail)
                            resolve('');
                        else
                            reject(new Error('File is empty'));
                        return;
                    }
                    if (encoding === 'utf8') {
                        const decoder = new TextDecoder('utf8');
                        resolve(decoder.decode(fileContent));
                    }
                    else if (encoding === 'str') {
                        resolve(fileContent.toString());
                    }
                    else if (encoding === 'hex') {
                        const hexString = Array.from(fileContent)
                            .map(byte => byte.toString(16).padStart(2, '0'))
                            .join('');
                        resolve(hexString);
                    }
                    else {
                        reject(new Error('Invalid encoding'));
                    }
                }
                catch (e) {
                    if (emptyOnFail)
                        resolve('');
                    else
                        reject(new Error(`Error reading file: ${e.message}`));
                }
            });
        });
    }
    static readFileSync(path, emptyOnFail = false) {
        if (!path || typeof path !== 'string') {
            if (emptyOnFail)
                return '';
            throw new Error('Invalid file path');
        }
        let file;
        try {
            file = Gio.File.new_for_path(path);
        }
        catch (e) {
            if (emptyOnFail)
                return '';
            throw new Error(`Error creating file object: ${e.message}`);
        }
        try {
            const fileContent = file.load_contents(null);
            if (!fileContent[0]) {
                if (emptyOnFail)
                    return '';
                throw new Error('Failed to read file');
            }
            if (fileContent[1].length === 0) {
                if (emptyOnFail)
                    return '';
                throw new Error('File is empty');
            }
            const decoder = new TextDecoder('utf8');
            return decoder.decode(fileContent[1]);
        }
        catch (e) {
            if (emptyOnFail)
                return '';
            throw new Error(`Error reading file: ${e.message}`);
        }
    }
    static getUrlAsync(url, emptyOnFail = false) {
        return new Promise((resolve, reject) => {
            const urlRegex = /^(http|https|ftp):\/\/[^\s/$.?#].[^\s]*$/;
            if (!url || typeof url !== 'string' || !urlRegex.test(url)) {
                if (emptyOnFail)
                    resolve('');
                else
                    reject(new Error('Invalid url path'));
                return;
            }
            let file;
            try {
                file = Gio.File.new_for_uri(url);
            }
            catch (e) {
                if (emptyOnFail)
                    resolve('');
                else
                    reject(new Error(`Error creating file object: ${e.message}`));
                return;
            }
            file.load_contents_async(null, (sourceObject, res) => {
                if (!sourceObject) {
                    reject(new Error('Source object invalid'));
                    return;
                }
                try {
                    const [success, fileContent] = sourceObject.load_contents_finish(res);
                    if (!success) {
                        if (emptyOnFail)
                            resolve('');
                        else
                            reject(new Error('Failed to read file'));
                        return;
                    }
                    if (fileContent.length === 0) {
                        if (emptyOnFail)
                            resolve('');
                        else
                            reject(new Error('File is empty'));
                        return;
                    }
                    const decoder = new TextDecoder('utf8');
                    resolve(decoder.decode(fileContent));
                }
                catch (e) {
                    if (emptyOnFail)
                        resolve('');
                    else
                        reject(new Error(`Error loading url: ${e.message}`));
                }
            });
        });
    }
    static runAsyncCommand(command, task) {
        if (Utils.experimentalPsSubprocess) {
            return CommandSubprocess.run(command, task);
        }
        return CommandHelper.runCommand(command, task);
    }
    static getLocalIcon(iconName) {
        if (!Utils.metadata || !Utils.metadata.path)
            return undefined;
        return Gio.icon_new_for_string(`${Utils.metadata.path}/icons/hicolor/scalable/actions/${iconName}.svg`);
    }
    static getNetworkInterfacesSync() {
        const devices = new Map();
        if (!Utils.hasIp())
            return devices;
        try {
            const path = Utils.commandPathLookup('ip -V');
            const [result, stdout, _stderr] = GLib.spawn_command_line_sync(`${path}ip -d -j addr`);
            if (result && stdout) {
                const decoder = new TextDecoder('utf8');
                const output = decoder.decode(stdout);
                const json = JSON.parse(output);
                for (const data of json) {
                    const name = data.ifname;
                    if (name === 'lo')
                        continue;
                    const flags = data.flags || [];
                    if (flags.includes('LOOPBACK'))
                        continue;
                    const ifindex = data.ifindex;
                    if (data.ifindex === undefined)
                        continue;
                    const device = {
                        name,
                        flags,
                        ifindex,
                    };
                    if (data.mtu)
                        device.mtu = data.mtu;
                    if (data.qdisc)
                        device.qdisc = data.qdisc;
                    if (data.operstate)
                        device.operstate = data.operstate;
                    if (data.linkmode)
                        device.linkmode = data.linkmode;
                    if (data.group)
                        device.group = data.group;
                    if (data.txqlen)
                        device.txqlen = data.txqlen;
                    if (data.link_type)
                        device.link_type = data.link_type;
                    if (data.address)
                        device.address = data.address;
                    if (data.broadcast)
                        device.broadcast = data.broadcast;
                    if (data.netmask)
                        device.netmask = data.netmask;
                    if (data.altnames)
                        device.altnames = data.altnames;
                    if (data.parentbus)
                        device.parentbus = data.parentbus;
                    if (data.parentdev)
                        device.parentdev = data.parentdev;
                    if (data.addr_info)
                        device.addr_info = data.addr_info;
                    if (data.linkinfo)
                        device.linkinfo = data.linkinfo;
                    const speedStr = Utils.readFileSync(`/sys/class/net/${name}/speed`, true).trim();
                    if (speedStr) {
                        if (Utils.isIntOrIntString(speedStr)) {
                            const speed = parseInt(speedStr, 10);
                            if (speed > 0)
                                device.speed = speed;
                        }
                    }
                    const duplex = Utils.readFileSync(`/sys/class/net/${name}/duplex`, true).trim();
                    if (duplex)
                        device.duplex = duplex;
                    devices.set(name, device);
                }
            }
        }
        catch (e) {
            Utils.error('Error getting network interfaces', e);
        }
        return devices;
    }
    static async getNetworkInterfacesAsync(task) {
        const devices = new Map();
        if (!Utils.hasIp())
            return devices;
        try {
            const path = Utils.commandPathLookup('ip -V');
            const result = await Utils.runAsyncCommand(`${path}ip -d -j addr`, task);
            if (result) {
                const json = JSON.parse(result);
                for (const data of json) {
                    const name = data.ifname;
                    if (name === 'lo')
                        continue;
                    const flags = data.flags || [];
                    if (flags.includes('LOOPBACK'))
                        continue;
                    const ifindex = data.ifindex;
                    if (data.ifindex === undefined)
                        continue;
                    const device = {
                        name,
                        flags,
                        ifindex,
                    };
                    if (data.mtu)
                        device.mtu = data.mtu;
                    if (data.qdisc)
                        device.qdisc = data.qdisc;
                    if (data.operstate)
                        device.operstate = data.operstate;
                    if (data.linkmode)
                        device.linkmode = data.linkmode;
                    if (data.group)
                        device.group = data.group;
                    if (data.txqlen)
                        device.txqlen = data.txqlen;
                    if (data.link_type)
                        device.link_type = data.link_type;
                    if (data.address)
                        device.address = data.address;
                    if (data.broadcast)
                        device.broadcast = data.broadcast;
                    if (data.netmask)
                        device.netmask = data.netmask;
                    if (data.altnames)
                        device.altnames = data.altnames;
                    if (data.parentbus)
                        device.parentbus = data.parentbus;
                    if (data.parentdev)
                        device.parentdev = data.parentdev;
                    if (data.addr_info)
                        device.addr_info = data.addr_info;
                    if (data.linkinfo)
                        device.linkinfo = data.linkinfo;
                    devices.set(name, device);
                }
                const promises = Array.from(devices.entries()).map(async ([name, device]) => {
                    const [speedStr, duplex] = await Promise.all([
                        Utils.readFileAsync(`/sys/class/net/${name}/speed`, true),
                        Utils.readFileAsync(`/sys/class/net/${name}/duplex`, true),
                    ]);
                    if (speedStr.trim()) {
                        if (Utils.isIntOrIntString(speedStr.trim())) {
                            const speed = parseInt(speedStr.trim(), 10);
                            if (speed > 0)
                                device.speed = speed;
                        }
                    }
                    if (duplex.trim()) {
                        device.duplex = duplex.trim();
                    }
                });
                await Promise.all(promises);
            }
        }
        catch (e) {
            Utils.error('Error getting network interfaces', e);
        }
        return devices;
    }
    static async getNetworkRoutesAsync(task) {
        const routes = [];
        if (!Utils.hasIp())
            return routes;
        try {
            const path = Utils.commandPathLookup('ip -V');
            const result = await Utils.runAsyncCommand(`${path}ip -d -j route show default`, task);
            if (result) {
                const json = JSON.parse(result);
                for (const data of json) {
                    const device = data.dev;
                    if (!device)
                        continue;
                    const route = {
                        type: data.type,
                        destination: data.dst,
                        gateway: data.gateway,
                        device: device,
                        protocol: data.protocol,
                        scope: data.scope,
                        metric: data.metric || 0,
                        flags: data.flags,
                    };
                    routes.push(route);
                }
            }
            return routes;
        }
        catch (e) {
            Utils.error('Error getting network routes', e);
            return routes;
        }
    }
    static getBlockDevicesSync() {
        const devices = new Map();
        if (!Utils.hasLsblk())
            return devices;
        try {
            const commandPath = Utils.commandPathLookup('lsblk -V');
            const [result, stdout, _stderr] = GLib.spawn_command_line_sync(`${commandPath}lsblk -Jb -o ID,UUID,NAME,KNAME,PKNAME,LABEL,TYPE,SUBSYSTEMS,MOUNTPOINTS,VENDOR,MODEL,PATH,RM,RO,STATE,OWNER,SIZE,FSUSE%,FSTYPE`);
            if (result && stdout) {
                const decoder = new TextDecoder('utf8');
                const output = decoder.decode(stdout);
                const json = JSON.parse(output);
                for (const device of json.blockdevices) {
                    Utils.parseBlockDevice(device, devices);
                }
            }
        }
        catch (e) {
            Utils.error('Error getting block devices', e);
        }
        return devices;
    }
    static async getBlockDevicesAsync(task) {
        const devices = new Map();
        if (!Utils.hasLsblk())
            return devices;
        try {
            const commandPath = Utils.commandPathLookup('lsblk -V');
            const result = await Utils.runAsyncCommand(`${commandPath}lsblk -Jb -o ID,UUID,NAME,KNAME,PKNAME,LABEL,TYPE,SUBSYSTEMS,MOUNTPOINTS,VENDOR,MODEL,PATH,RM,RO,STATE,OWNER,SIZE,FSUSE%,FSTYPE`, task);
            if (result) {
                const json = JSON.parse(result);
                for (const device of json.blockdevices) {
                    Utils.parseBlockDevice(device, devices);
                }
            }
        }
        catch (e) {
            Utils.error('Error getting block devices', e);
        }
        return devices;
    }
    static parseBlockDevice(device, devices, parent = null) {
        const id = device.id;
        if (!id)
            return;
        if (devices.has(id)) {
            if (parent)
                devices.get(id)?.parents.push(parent);
            return;
        }
        const uuid = device.uuid;
        const name = device.name;
        const kname = device.kname;
        const pkname = device.pkname;
        const label = device.label;
        const type = device.type;
        if (type === 'loop')
            return;
        const subsystems = device.subsystems;
        let mountpoints = [];
        if (device.mountpoints && device.mountpoints.length > 0 && device.mountpoints[0])
            mountpoints = device.mountpoints;
        const vendor = device.vendor?.trim();
        const model = device.model?.trim();
        const path = device.path;
        const removable = device.rm;
        const readonly = device.ro;
        const state = device.state;
        const owner = device.owner;
        const size = device.size;
        const usage = parseInt(device['fsuse%'], 10);
        const filesystem = device.fstype;
        const deviceObj = {
            id,
            uuid,
            name,
            kname,
            pkname,
            label,
            type,
            subsystems,
            mountpoints,
            vendor,
            model,
            path,
            removable,
            readonly,
            state,
            owner,
            size,
            usage,
            filesystem,
            parents: [],
        };
        if (parent) {
            deviceObj.parents.push(parent);
        }
        if (device.children && device.children.length > 0) {
            for (const child of device.children) {
                Utils.parseBlockDevice(child, devices, deviceObj);
            }
        }
        else {
            devices.set(id, deviceObj);
        }
    }
    static parseRGBA(colorString, fallbackValue) {
        const color = { red: 0, green: 0, blue: 0, alpha: 1 };
        if (!colorString) {
            if (fallbackValue)
                return Utils.parseRGBA(fallbackValue);
            throw new Error('Color string is empty');
        }
        if (colorString.startsWith('#')) {
            colorString = colorString.substring(1);
            if (colorString.length === 3)
                colorString = colorString
                    .split('')
                    .map(char => char + char)
                    .join('');
            if (colorString.length === 6 || colorString.length === 8) {
                color.red = parseInt(colorString.substring(0, 2), 16) / 255;
                color.green = parseInt(colorString.substring(2, 4), 16) / 255;
                color.blue = parseInt(colorString.substring(4, 6), 16) / 255;
                if (colorString.length === 8)
                    color.alpha = parseInt(colorString.substring(6, 8), 16) / 255;
            }
            else {
                if (fallbackValue)
                    return Utils.parseRGBA(fallbackValue);
                throw new Error('Invalid hex color format');
            }
        }
        else if (colorString.toLowerCase().startsWith('rgb')) {
            const match = colorString.match(/\d+(\.\d+)?/g);
            if (!match) {
                if (fallbackValue)
                    return Utils.parseRGBA(fallbackValue);
                throw new Error('Invalid RGB(A) format');
            }
            const values = match.map(Number);
            if (values.length === 3 || values.length === 4) {
                color.red = values[0] / 255;
                color.green = values[1] / 255;
                color.blue = values[2] / 255;
                if (values.length === 4)
                    color.alpha = values[3];
                if (values.some((value, index) => (index < 3 && (value < 0 || value > 255)) ||
                    (index === 3 && (value < 0 || value > 1)))) {
                    if (fallbackValue)
                        return Utils.parseRGBA(fallbackValue);
                    throw new Error('RGB values must be between 0 and 255, and alpha value must be between 0 and 1');
                }
            }
            else {
                if (fallbackValue)
                    return Utils.parseRGBA(fallbackValue);
                throw new Error('Invalid RGB(A) format');
            }
        }
        else {
            if (fallbackValue)
                return Utils.parseRGBA(fallbackValue);
            throw new Error('Invalid color format');
        }
        return color;
    }
    static valueTreeExtimatedHeight(valueTree) {
        let length = valueTree.size;
        for (const value of valueTree.values())
            length += value.length;
        return (length *= 20);
    }
    static xmlParse(xml, skips = []) {
        if (!Utils.xmlParser)
            return undefined;
        return Utils.xmlParser.parse(xml, skips);
    }
    static performanceStart(name) {
        if (!Utils.debug)
            return;
        let performance = Utils.performanceMap?.get(name);
        if (!performance) {
            performance = { start: GLib.get_monotonic_time(), mean: 0, count: 0 };
        }
        else {
            performance.start = GLib.get_monotonic_time();
        }
        Utils.performanceMap?.set(name, performance);
    }
    static performanceEnd(name) {
        if (!Utils.debug)
            return;
        const performance = Utils.performanceMap?.get(name);
        if (performance) {
            const end = GLib.get_monotonic_time();
            const time = (end - performance.start) / 1000;
            performance.mean =
                (performance.mean * performance.count + time) / (performance.count + 1);
            performance.count++;
            Utils.log(`${name} took ${performance.mean.toFixed(2)}ms (mean: ${performance.mean.toFixed(2)}ms)`);
            Utils.performanceMap?.set(name, {
                start: GLib.get_monotonic_time(),
                mean: performance.mean,
                count: performance.count,
            });
        }
    }
    static convertCharListToString(value) {
        const firstNullIndex = value.indexOf(0);
        if (firstNullIndex === -1)
            return String.fromCharCode.apply(null, value);
        else
            return String.fromCharCode.apply(null, value.slice(0, firstNullIndex));
    }
    static roundFloatingPointNumber(num) {
        const numStr = num.toString();
        const decimalIndex = numStr.indexOf('.');
        if (decimalIndex === -1)
            return num;
        const fractionLength = numStr.length - decimalIndex - 1;
        let precision = Math.min(10, fractionLength);
        if (fractionLength > 10)
            precision = fractionLength - 10;
        return Number(num.toFixed(precision));
    }
    static mapToObject(map) {
        const obj = {};
        map.forEach((value, key) => {
            obj[key] = value instanceof Map ? Utils.mapToObject(value) : value;
        });
        return obj;
    }
    static comparePaths(reference, compare) {
        if (reference.length > compare.length)
            return false;
        return reference.every((element, index) => element === compare[index]);
    }
    static lowPriorityTask(callback, priority = GLib.PRIORITY_DEFAULT_IDLE) {
        const task = GLib.idle_add(priority, () => {
            callback();
            Utils.lowPriorityTasks = Utils.lowPriorityTasks.filter(id => id !== task);
            return GLib.SOURCE_REMOVE;
        });
        Utils.lowPriorityTasks.push(task);
    }
    static timeoutTask(callback, timeout, priority = GLib.PRIORITY_DEFAULT) {
        const task = GLib.timeout_add(priority, timeout, () => {
            callback();
            Utils.timeoutTasks = Utils.timeoutTasks.filter(id => id !== task);
            return GLib.SOURCE_REMOVE;
        });
        Utils.timeoutTasks.push(task);
    }
    static configUpdateFixes() {
        const selectedGpu = Config.get_json('processor-menu-gpu');
        if (selectedGpu && selectedGpu.domain) {
            if (!selectedGpu.domain.includes(':')) {
                selectedGpu.domain = '0000:' + selectedGpu.domain;
                Config.set('processor-menu-gpu', selectedGpu, 'json');
            }
        }
        const graphColor2 = Config.get_string('memory-header-graph-color2');
        if (graphColor2 === 'rgba(214,29,29,1.0)') {
            Config.set('memory-header-graph-color2', 'rgba(29,172,214,0.3)', 'string');
        }
        const barsColor2 = Config.get_string('memory-header-bars-color2');
        if (barsColor2 === 'rgba(214,29,29,1.0)') {
            Config.set('memory-header-bars-color2', 'rgba(29,172,214,0.3)', 'string');
        }
        const processorMenuGpu = Config.get_json('processor-menu-gpu');
        let gpuMain = Config.get_json('gpu-main');
        if (processorMenuGpu && !gpuMain) {
            Config.set('gpu-main', processorMenuGpu, 'json');
            Config.set('processor-menu-gpu', '""', 'string');
        }
        const processorMenuGpuColor = Config.get_string('processor-menu-gpu-color');
        if (processorMenuGpuColor) {
            Config.set('gpu-header-activity-bar-color1', processorMenuGpuColor, 'string');
            Config.set('gpu-header-activity-graph-color1', processorMenuGpuColor, 'string');
            Config.set('processor-menu-gpu-color', '', 'string');
        }
        const height = Config.get_int('headers-height');
        if (height === 28) {
            Config.set('headers-height-override', 0, 'int');
            Config.set('headers-height', 0, 'int');
        }
        else if (height > 15 && height < 80) {
            Config.set('headers-height-override', height, 'int');
            Config.set('headers-height', 0, 'int');
        }
        let profiles = Config.get_json('profiles');
        if (!profiles) {
            profiles = {};
            const currentProfile = Config.get_string('current-profile') || 'default';
            profiles[currentProfile] = Config.getCurrentSettingsData(Config.globalSettingsKeys);
            Config.set('profiles', profiles, 'json');
        }
        gpuMain = Config.get_json('gpu-main');
        if (gpuMain && gpuMain.domain) {
            let gpuData = Config.get_json('gpu-data');
            if (!gpuData) {
                gpuData = [];
                if (!gpuMain.domain.includes(':'))
                    gpuMain.domain = '0000:' + gpuMain.domain;
                gpuMain.monitor = true;
                gpuData.push(gpuMain);
                Config.set('gpu-data', gpuData, 'json');
            }
        }
        let experimentalFeatures = Config.get_json('experimental-features');
        if (!experimentalFeatures) {
            Config.set('experimental-features', [], 'json');
            experimentalFeatures = [];
        }
        experimentalFeatures = experimentalFeatures.filter((feature) => Config.experimentalFeatures.includes(feature));
        Config.set('experimental-features', experimentalFeatures, 'json');
    }
    static unitToIcon(unit) {
        const icon = {
            gicon: Utils.getLocalIcon('am-dialog-info-symbolic'),
            fallbackIconName: 'dialog-info-symbolic',
        };
        if (unit === '°C' || unit === 'C' || unit === '°F' || unit === 'F') {
            icon.gicon = Utils.getLocalIcon('am-temperature-symbolic');
            icon.fallbackIconName = 'temperature-symbolic';
        }
        else if (unit === 'RPM') {
            icon.gicon = Utils.getLocalIcon('am-fan-symbolic');
            icon.fallbackIconName = 'fan-symbolic';
        }
        else if (unit === 'V' || unit === 'mV') {
            icon.gicon = Utils.getLocalIcon('am-voltage-symbolic');
            icon.fallbackIconName = 'battery-symbolic';
        }
        else if (unit === 'kW' || unit === 'W') {
            icon.gicon = Utils.getLocalIcon('am-power-symbolic');
            icon.fallbackIconName = 'plug-symbolic';
        }
        else if (unit === 'A' || unit === 'mA') {
            icon.gicon = Utils.getLocalIcon('am-current-symbolic');
            icon.fallbackIconName = 'battery-symbolic';
        }
        else if (unit === 'J') {
            icon.gicon = Utils.getLocalIcon('am-power-symbolic');
            icon.fallbackIconName = 'battery-symbolic';
        }
        else if (unit === 'GHz' || unit === 'MHz' || unit === 'Hz') {
            icon.gicon = Utils.getLocalIcon('am-frequency-symbolic');
            icon.fallbackIconName = 'battery-symbolic';
        }
        return icon;
    }
    static splitStringByLength(str, length, splitters, range) {
        if (range >= length - 1)
            throw new Error('Range must be less than length');
        const linesNum = Math.ceil(str.length / length);
        const linesChars = Math.round(str.length / linesNum);
        const lines = [];
        for (let i = 1; i < linesNum; i++) {
            let splitPoint = linesChars;
            if (!splitters.includes(str[splitPoint])) {
                for (let j = 0; j < range; j++) {
                    if (splitters.includes(str[splitPoint + j])) {
                        splitPoint = splitPoint + j;
                        break;
                    }
                    if (splitters.includes(str[splitPoint - j])) {
                        splitPoint = splitPoint - j;
                        break;
                    }
                }
            }
            const line = str.substring(0, splitPoint + 1);
            str = str.substring(splitPoint + 1);
            lines.push(line.trim());
        }
        lines.push(str.trim());
        return lines;
    }
    static deepEqual(obj1, obj2) {
        if (obj1 === obj2)
            return true;
        if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null)
            return false;
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        if (keys1.length !== keys2.length)
            return false;
        for (const key of keys1) {
            if (!keys2.includes(key) || !Utils.deepEqual(obj1[key], obj2[key]))
                return false;
        }
        return true;
    }
    static nethogsHasCaps() {
        if (Utils.nethogsCaps !== undefined)
            return (Utils.nethogsCaps.includes('cap_net_admin') &&
                Utils.nethogsCaps.includes('cap_net_raw=ep'));
        let [result, stdout] = GLib.spawn_command_line_sync('which nethogs');
        if (result === false || !stdout) {
            Utils.nethogsCaps = [];
            return false;
        }
        const decoder = new TextDecoder();
        const nethogs = decoder.decode(stdout).trim();
        if (nethogs === '') {
            Utils.nethogsCaps = [];
            return false;
        }
        [result, stdout] = GLib.spawn_command_line_sync(`getcap ${nethogs}`);
        if (result === false || !stdout) {
            Utils.nethogsCaps = [];
            return false;
        }
        Utils.nethogsCaps = decoder.decode(stdout).split(/\s+|,/).slice(1);
        return (Utils.nethogsCaps.includes('cap_net_admin') &&
            Utils.nethogsCaps.includes('cap_net_raw=ep'));
    }
    static getGpuUUID(gpuInfo) {
        return `${gpuInfo.domain}:${gpuInfo.bus}.${gpuInfo.slot}`;
    }
    static parseCpuPresentFile(content) {
        const presentParts = content.trim().split(',');
        const presentCpus = [];
        for (const part of presentParts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(n => parseInt(n, 10));
                for (let i = start; i <= end; i++)
                    presentCpus.push(i);
            }
            else {
                presentCpus.push(parseInt(part, 10));
            }
        }
        return presentCpus;
    }
}
Utils.debug = false;
Utils.defaultMonitors = ['processor', 'gpu', 'memory', 'storage', 'network', 'sensors'];
Utils.defaultIndicators = {
    processor: ['icon', 'bar', 'graph', 'percentage', 'frequency'],
    gpu: [
        'icon',
        'activity bar',
        'activity graph',
        'activity percentage',
        'memory bar',
        'memory graph',
        'memory percentage',
        'memory value',
    ],
    memory: ['icon', 'bar', 'graph', 'percentage', 'value', 'free'],
    storage: ['icon', 'bar', 'percentage', 'value', 'free', 'IO bar', 'IO graph', 'IO speed'],
    network: ['icon', 'IO bar', 'IO graph', 'IO speed'],
    sensors: ['icon', 'value'],
};
Utils.xmlParser = null;
Utils.ready = false;
Utils.performanceMap = null;
Utils.lastCachedHwmonDevices = 0;
Utils.cachedHwmonDevices = new Map();
Utils.explicitZero = false;
Utils.commandsPath = null;
Utils.unitMap = {
    'kB/s': { base: 1000, mult: 1, labels: ['B/s', 'kB/s', 'MB/s', 'GB/s', 'TB/s'] },
    'KiB/s': { base: 1024, mult: 1, labels: ['B/s', 'KiB/s', 'MiB/s', 'GiB/s', 'TiB/s'] },
    'kb/s': { base: 1000, mult: 8, labels: ['b/s', 'kb/s', 'Mb/s', 'Gb/s', 'Tb/s'] },
    'Kibit/s': {
        base: 1024,
        mult: 8,
        labels: ['bit/s', 'Kibit/s', 'Mibit/s', 'Gibit/s', 'Tibit/s'],
    },
    kBps: { base: 1000, mult: 1, labels: ['Bps', 'kBps', 'MBps', 'GBps', 'TBps'] },
    KiBps: { base: 1024, mult: 1, labels: ['Bps', 'KiBps', 'MiBps', 'GiBps', 'TiBps'] },
    Kibps: { base: 1024, mult: 8, labels: ['bps', 'Kibps', 'Mibps', 'Gibps', 'Tibps'] },
    kbps: { base: 1000, mult: 8, labels: ['bps', 'kbps', 'Mbps', 'Gbps', 'Tbps'] },
    Kibitps: {
        base: 1024,
        mult: 8,
        labels: ['bitps', 'Kibitps', 'Mibitps', 'Gibitps', 'Tibitps'],
    },
    'k ': { base: 1000, mult: 1, labels: [' ', 'k', 'M', 'G', 'T'] },
    Ki: { base: 1024, mult: 1, labels: ['  ', 'Ki', 'Mi', 'Gi', 'Ti'] },
};
Utils.unit2Map = {
    'kB-kiB': { base: 1024, mult: 1, labels: [' B', 'kB', 'MB', 'GB', 'TB'] },
    'kB-KB': { base: 1000, mult: 1, labels: [' B', 'kB', 'MB', 'GB', 'TB'] },
    kiB: { base: 1024, mult: 1, labels: [' B', 'kiB', 'MiB', 'GiB', 'TiB'] },
    KiB: { base: 1024, mult: 1, labels: [' B/s', 'KiB', 'MiB', 'GiB', 'TiB'] },
    KB: { base: 1000, mult: 1, labels: [' B', 'KB', 'MB', 'GB', 'TB'] },
    'k ': { base: 1000, mult: 1, labels: [' ', 'k', 'M', 'G', 'T'] },
    Ki: { base: 1024, mult: 1, labels: ['  ', 'Ki', 'Mi', 'Gi', 'Ti'] },
};
Utils.unit3Map = {
    Q: { base: 1000, mult: 1, labels: ['', 'K', 'M', 'B', 'T', 'Q'] },
};
Utils.unit4Map = {
    Hz: { base: 1000, mult: 1, labels: ['Hz', 'kHz', 'MHz', 'GHz', 'THz'] },
    kHz: { base: 1000, mult: 1, labels: ['kHz', 'MHz', 'GHz', 'THz'] },
    MHz: { base: 1000, mult: 1, labels: ['MHz', 'GHz', 'THz'] },
    GHz: { base: 1000, mult: 1, labels: ['GHz', 'THz'] },
    THz: { base: 1000, mult: 1, labels: ['THz'] },
};
Utils.hwmonPromise = null;
Utils.sensorsPrefix = ['temp', 'fan', 'in', 'power', 'curr', 'energy', 'pwm', 'freq'];
Utils.cachedUptimeSeconds = 0;
Utils.uptimeTimer = 0;
Utils.experimentalPsSubprocess = undefined;
Utils.lowPriorityTasks = [];
Utils.timeoutTasks = [];
Utils.nethogsCaps = undefined;
export default Utils;

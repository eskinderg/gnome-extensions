import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
export default class CommandHelper {
    static runCommand(command, cancellableTaskManager) {
        return new Promise((resolve, reject) => {
            let proc = null;
            try {
                const [ok, argv] = GLib.shell_parse_argv(command);
                if (!ok || !argv || argv.length === 0) {
                    reject(new Error(`Failed to parse CommandHelper: "${command}"`));
                    return;
                }
                const flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;
                proc = new Gio.Subprocess({ argv, flags });
                try {
                    const init = proc.init(cancellableTaskManager?.cancellable || null);
                    if (!init) {
                        reject(new Error('Failed to initialize CommandHelper'));
                        return;
                    }
                }
                catch (e) {
                    reject(new Error(`Failed to initialize CommandHelper: ${e.message}`));
                    return;
                }
                cancellableTaskManager?.setSubprocess(proc);
                proc.wait_async(cancellableTaskManager?.cancellable || null, (_source, res, _data) => {
                    let stdoutPipe = null;
                    let stderrPipe = null;
                    try {
                        const result = proc?.wait_finish(res);
                        const exitStatus = proc?.get_exit_status();
                        if (!result || exitStatus !== 0) {
                            stderrPipe = proc?.get_stderr_pipe() ?? null;
                            const stderrContent = CommandHelper.readAll(stderrPipe, cancellableTaskManager).trim();
                            reject(new Error(`CommandHelper failed with exit status ${exitStatus}: ${stderrContent}`));
                            return;
                        }
                        stdoutPipe = proc?.get_stdout_pipe() ?? null;
                        const stdoutContent = CommandHelper.readAll(stdoutPipe, cancellableTaskManager).trim();
                        if (!stdoutContent)
                            throw new Error('No output');
                        resolve(stdoutContent.trim());
                    }
                    catch (e) {
                        reject(new Error(`Failed to read CommandHelper output: ${e.message}`));
                    }
                    finally {
                        stdoutPipe?.close(cancellableTaskManager?.cancellable || null);
                        stderrPipe?.close(cancellableTaskManager?.cancellable || null);
                    }
                });
            }
            catch (e) {
                reject(new Error(`Failed to run CommandHelper: ${e.message}`));
                proc?.force_exit();
            }
        });
    }
    static readAll(stream, cancellableTaskManager) {
        if (!stream)
            return '';
        let output = '';
        let bytes;
        const decoder = new TextDecoder('utf-8');
        while ((bytes = stream.read_bytes(8192, cancellableTaskManager?.cancellable || null)) &&
            bytes.get_size() > 0) {
            output += decoder.decode(bytes.toArray()).trim();
        }
        return output;
    }
}

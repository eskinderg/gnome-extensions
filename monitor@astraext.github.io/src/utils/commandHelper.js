import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
export default class CommandHelper {
    static runCommand(command, cancellableTaskManager) {
        return new Promise((resolve, reject) => {
            try {
                const [ok, argv] = GLib.shell_parse_argv(command);
                if (!ok || !argv || argv.length === 0) {
                    reject(new Error(`Failed to parse command: "${command}"`));
                    return;
                }
                const flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;
                const proc = new Gio.Subprocess({ argv, flags });
                try {
                    const init = proc.init(cancellableTaskManager?.cancellable || null);
                    if (!init) {
                        reject(new Error('Failed to initialize subprocess'));
                        return;
                    }
                }
                catch (e) {
                    reject(new Error(`Failed to initialize subprocess: ${e.message}`));
                    return;
                }
                cancellableTaskManager?.setSubprocess(proc);
                proc.wait_async(cancellableTaskManager?.cancellable || null, (_source, res, _data) => {
                    const result = proc.wait_finish(res);
                    const exitStatus = proc.get_exit_status();
                    if (!result || exitStatus !== 0) {
                        const stderrPipe = proc.get_stderr_pipe();
                        const stderrContent = CommandHelper.readAll(stderrPipe, cancellableTaskManager).trim();
                        reject(new Error(`Command failed with exit status ${exitStatus}: ${stderrContent}`));
                        return;
                    }
                    const stdoutPipe = proc.get_stdout_pipe();
                    const stdoutContent = CommandHelper.readAll(stdoutPipe, cancellableTaskManager).trim();
                    if (!stdoutContent)
                        throw new Error('No output');
                    resolve(stdoutContent.trim());
                });
            }
            catch (e) {
                reject(new Error(`Failed to run command: ${e.message}`));
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

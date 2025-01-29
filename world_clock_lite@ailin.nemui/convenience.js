
import Gio from 'gi://Gio'

export function getClocksSettings () {
  try {
    return new Gio.Settings({ schema: 'org.gnome.clocks' })
  } catch (error) {
    throw new Error(`
=======================================================================
Gnome Clocks is not installed natively, please check your installation!
(Snap or Flatpak are not supported!)
=======================================================================`)
  }
}

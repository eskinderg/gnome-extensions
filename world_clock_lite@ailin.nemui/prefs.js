
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk'
import Gdk from 'gi://Gdk'

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

import {getClocksSettings} from './convenience.js'


export default class PanelWorldClockPreferences extends ExtensionPreferences {

  getPreferencesWidget () {
    this._position_inhibitor = false

    const ui = Gtk.Builder.new_from_file(this.dir.get_path() + "/prefs.ui")
    const win = ui.get_object('content-table')

    const mySettings = this.getSettings()
    const clocksSettings = getClocksSettings()

    mySettings.bind('hide-local',   ui.get_object('local-cb'),       'active', Gio.SettingsBindFlags.DEFAULT)
    mySettings.bind('num-buttons',  ui.get_object('num-adj'),        'value',  Gio.SettingsBindFlags.DEFAULT)
    mySettings.bind('num-buttons2', ui.get_object('num-adj2'),       'value',  Gio.SettingsBindFlags.DEFAULT)
    mySettings.bind('show-city',    ui.get_object('show-city-cb'),   'active', Gio.SettingsBindFlags.DEFAULT)
    mySettings.bind('opaque',       ui.get_object('opaque-cb'),      'active', Gio.SettingsBindFlags.DEFAULT)
    mySettings.bind('in-calendar',  ui.get_object('in-calendar-cb'), 'active', Gio.SettingsBindFlags.DEFAULT)

    const self = this

    const positions_button_syms = ['LR', 'ML', 'M1', 'MR', 'RL']
    const positionFromSetting = () => {
      if (self._position_inhibitor)
        return

      self._position_inhibitor = true
      positions_button_syms.map(pos_symbol => {
        ui.get_object('position-' + pos_symbol)
          .set_active(pos_symbol == mySettings.get_string('button-position') ||
                      pos_symbol == mySettings.get_string('button-position2'))
      })
      if ((mySettings.get_string('button-position') == mySettings.get_string('button-position2')))
        ui.get_object('num-sp2').hide()
      else
        ui.get_object('num-sp2').show()
      self._position_inhibitor = false
    }
    const middleOf = (a, b, c) => ((a + (b - a) / 2) - ((c - 1) / 2)) * 1.1 + ((c - 1) / 2)

    positions_button_syms.map(pos_symbol => {
      const cl = pos_symbol
      ui.get_object('position-' + cl).connect('toggled', object => {
        const cl2 = cl
        if (self._position_inhibitor)
          return

        self._position_inhibitor = true

        if (cl2 == mySettings.get_string('button-position2'))
          mySettings.set_string('button-position2', mySettings.get_string('button-position'))

        else if (cl2 == mySettings.get_string('button-position'))
          mySettings.set_string('button-position', mySettings.get_string('button-position2'))

        else if (middleOf(positions_button_syms.indexOf(mySettings.get_string('button-position')),
                          positions_button_syms.indexOf(mySettings.get_string('button-position2')),
                          positions_button_syms.length) < positions_button_syms.indexOf(cl))
          mySettings.set_string('button-position2', cl)

        else
          mySettings.set_string('button-position', cl)

        self._position_inhibitor = false
        positionFromSetting()
      })
    })
    positionFromSetting()

    mySettings.connect('changed::button-position',  positionFromSetting)
    mySettings.connect('changed::button-position2', positionFromSetting)

    ui.get_object('open-gnome-clocks').connect('clicked', () => {
      const di = Gio.DesktopAppInfo.new('org.gnome.clocks.desktop')
      const ctx = Gdk.Display.get_default().get_app_launch_context()
      di.launch([], ctx)
    })
  
    // Make sure the window doesn't outlive the settings object
    win._settings = mySettings
    win._clocksSettings = clocksSettings

    return win
  }
}

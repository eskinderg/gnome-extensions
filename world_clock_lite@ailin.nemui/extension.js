
import Gettext      from 'gettext'

import Clutter      from 'gi://Clutter'
import GObject      from 'gi://GObject'
import GLib         from 'gi://GLib'
import Gio          from 'gi://Gio'
import GnomeDesktop from 'gi://GnomeDesktop'
import St           from 'gi://St'
import GWeather     from 'gi://GWeather'

import * as Main          from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu     from 'resource:///org/gnome/shell/ui/panelMenu.js'
import * as PopupMenu     from 'resource:///org/gnome/shell/ui/popupMenu.js'

import {Extension}        from 'resource:///org/gnome/shell/extensions/extension.js'

import {getClocksSettings} from './convenience.js'

const _gd30 = Gettext.domain('gnome-desktop-3.0').gettext

var WorldClockMultiButton = GObject.registerClass(
class WorldClockMultiButton extends PanelMenu.Button {

  _init (lbt, extension) {
    super._init(0.25)

    this._extn = extension

    this._myClockDisp = new St.Label({
      y_align: Clutter.ActorAlign.CENTER,
      opacity: this._extn._mySettings.get_boolean('opaque') ? 255 : 150
    })
    this.add_child(this._myClockDisp)

    this._place = new St.Label({ style_class: 'location-label' })
    this._sunrise = new St.Label()
    this._sunset = new St.Label()

    const m = this.menu
    this._place._delegate = this
    m.box.add_child(this._place)

    let box = new St.BoxLayout({ style_class: 'location-day' })
    this._dayIcon = new St.Icon({
      icon_size: 15,
      icon_name: 'weather-clear-symbolic',
      opacity: 150,
      style_class: 'location-sunrise-icon'
    })
    box.add_child(this._dayIcon)
    box.add_child(this._sunrise)
    
    this._nightIcon = new St.Icon({
      icon_size: 15,
      icon_name: 'weather-clear-night-symbolic',
      style_class: 'location-sunset-icon'
    })
    box.add_child(this._nightIcon)
    box.add_child(this._sunset)
    box._delegate = this
    m.box.add_child(box)

    // use the existing global gettext translation
    this._selectLoc = new PopupMenu.PopupSubMenuMenuItem(_("Locations"))
    m.addMenuItem(this._selectLoc)

    this.setLbt(lbt)
  }

  setLbt (lbt) {
    this._lbt = lbt

    let nameMap = this._extn._mySettings.get_value('name-map').deep_unpack()
    if (nameMap[lbt.code])
      this._place.set_text(nameMap[lbt.code])
    else
      this._place.set_text(lbt.displayName)
    this.make_loc_menu()
    this.refresh()
  }

  _fromUnix (time) {
    return GLib.DateTime.new_from_unix_utc(time).to_timezone(this._lbt._tz)
  }

  refresh () {
    if (this._extn._remaking > 1) { return }
    this._myClockDisp.set_text(this._lbt.getTime())
    let i = this._lbt._gwInfo
    i.update()

    let night_icon_key = 'weather-clear-night'
    let moonPhase_icon_name = castInt(i.get_value_moonphase()[1]/10) + "0"
    while (moonPhase_icon_name.length < 3) { moonPhase_icon_name = "0" + moonPhase_icon_name }
    moonPhase_icon_name = night_icon_key + "-" + moonPhase_icon_name

    if (!this._extn._theme.has_icon(moonPhase_icon_name)) {
      moonPhase_icon_name = night_icon_key + '-symbolic'
    }

    let valid_map = i.get_location().get_level() <= GWeather.LocationLevel.WEATHER_STATION
    if (valid_map) {
      let sunrise = i.get_value_sunrise()
      let sunriseTime = this._fromUnix(sunrise[1])
      let sunset = i.get_value_sunset()
      let sunsetTime = this._fromUnix(sunset[1])

      this._dayIcon.set_icon_name(!sunrise[0] && !i.is_daytime() ? moonPhase_icon_name : 'weather-clear-symbolic')
      this._nightIcon.set_icon_name(!sunset[0] && i.is_daytime() ? 'weather-clear-symbolic' : moonPhase_icon_name)

      this._dayIcon.set_opacity(!sunrise[0] && !i.is_daytime() ? 255 : 150)
      this._dayIcon.show()
      this._nightIcon.set_opacity(!sunset[0] && i.is_daytime() ? 150 : 255)
      this._nightIcon.show()

      this._sunrise.set_text(sunrise[0] ? sunriseTime.format(_gd30(this._extn.get12hTimeFormat(sunriseTime))) : "\u2014\u2014")
      this._sunrise.show()
      this._sunset.set_text(sunset[0] ? sunsetTime.format(_gd30(this._extn.get12hTimeFormat(sunsetTime))) : "")
      this._sunset.show()
    } else {
      this._sunrise.hide()
      this._dayIcon.hide()
      this._sunset.hide()
      this._nightIcon.hide()
    }
  }

  make_loc_menu () {
    const lm = this._selectLoc.menu
    lm.removeAll()
    const self = this
    const skipLocal = this._extn._mySettings.get_boolean('hide-local')
    let entries = 0
    this._extn._locations.map(lbt => {
      if (skipLocal && lbt.tzSameAsLocal()) { return }
      let display = lbt.displayName3

      // rtl time fix
      if (this._extn._lang_is_rtl)
        display = "\u202a" + display + "\u202c"

      let item = new PopupMenu.PopupMenuItem(display)
      item.location = lbt
      item.setOrnament(lbt.code == self._lbt.code ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE)
      lm.addMenuItem(item)
      entries += 1
      item.connect('activate', actor => {
        let sourceId
        sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
          self.switchLbt(actor.location)
          self._extn.saveButtonConfig()
          self._extn._nextTicks = self._extn._nextTicks.filter(e => e != sourceId)
          return GLib.SOURCE_REMOVE
        })
        self._extn._nextTicks.push(sourceId)
      })
    })

    if (entries <= 1)
      this._selectLoc.hide()
    else
      this._selectLoc.show()
  }

  switchLbt (lbt) {
    let lastLoc = this._lbt
    if (lastLoc.code == lbt.code) { return }
    this._extn._buttons.map(x => {
      if (x._lbt.code == lbt.code)
        x.setLbt(lastLoc)
    })
    this.setLbt(lbt)
  }
})

const LocationBasedTime = (
class LocationBasedTime {

  constructor (...args) {
    this._init(...args)
  }

  _init (loc, extension) {
    this._loc = loc
    this._extn = extension

    this._tz = loc.get_timezone()
    this._gwInfo = GWeather.Info.new(loc)
    this._gwInfo.set_enabled_providers(GWeather.Provider.NONE)

    const city = loc.has_coords() ? this._extn._world.find_nearest_city(...loc.get_coords()) : loc

    this.displayName = loc.get_city_name() || city.get_name()
    this.displayName2 = loc.get_name()

    const country_name = loc.get_country_name()
    if (country_name)
      this.displayName = (this.displayName ? this.displayName + ", " : "") + country_name

    const country_code = loc.get_country()
    if (country_code)
      this.displayName2 = (this.displayName2 ? this.displayName2 + " (" + country_code + ")" :
                           country_code)

    if (!this.displayName)
      this.displayName = loc.get_name()

    let ncode = [loc]
    let code = []
    while (!code.length && ncode.length) {
      ncode = ncode.map(x => {
        const c = x.get_code()
        if (c) {
          code.push(c)
          return []
        }
        let r = []
        let iter = null
        while ((iter = x.next_child(iter)) !== null) {
          r.push(iter)
        }
        return r
      }).reduce((a, b) => a.concat(b))
    }
    this.code = code.join(",")

    const nameMap = this._extn._mySettings.get_value('name-map').deep_unpack()
    if (nameMap[this.code])
      this.displayName3 = nameMap[this.code] + (country_code ? " (" + country_code + ")" : "")
    else
      this.displayName3 = this.displayName2
  }

  now () {
    return GLib.DateTime.new_now(this._tz)
  }

  tzSameAsLocal () {
    const now = this.now()
    return now.get_timezone_abbreviation() == now.to_local().get_timezone_abbreviation()
  }

  getTime () {
    const now = this.now()
    const now_here = now.to_local()
    // from gnome-desktop::gnome-wall-clock.c
    const format_string = _gd30((now_here.get_day_of_month() != now.get_day_of_month() ?
                                 "%a " : "") + this._extn.get12hTimeFormat(now))
    if (this._extn._mySettings.get_boolean('show-city')) {
      const sfx = this.displayName3.match(/ \((\w+)\)$/)
      return now.format(format_string) + " " + (this._loc.has_coords() || !sfx ? this.displayName3 : sfx[1])
    } else {
      return now.format(format_string + " %Z")
    }
  }
})

const castInt = num => ~~num

export default class PanelWorldClockExtension extends Extension {

  constructor (metadata) {
    super(metadata)

    this._enableSuccess = false
  }

  get12hTimeFormat (when) {
    // from gnome-desktop::gnome-wall-clock.c
    return this._gnomeClockSettings.get_string('clock-format') != '12h' ||
      !when.format("%p").length ? "%R" : "%l:%M %p"
  }

  saveButtonConfig () {
    const config = this._buttons.map(x => x._lbt.code)
    this._mySettings.set_value('active-buttons', new GLib.Variant('as', config))
  }

  _remakeButtons () {
    if (this._remaking) { return }
    this._remaking = 2

    this._locations.sort((a, b) => a.displayName3.localeCompare(b.displayName3))
    this._locations.sort((a, b) => a.now().get_utc_offset() - b.now().get_utc_offset())

    const self = this
    this._buttons.map(x => x.destroy())
    this._buttons = this._locations.map(x => new WorldClockMultiButton(x, self))

    let i = 0
    this._mySettings.get_value('active-buttons').deep_unpack().map(c => {
      const ob = self._buttons.filter(b => b._lbt.code == c)
      if (ob[0] && self._buttons[i]) {
        self._buttons[i].switchLbt(ob[0]._lbt)
        i += 1
      }
    })
    this.saveButtonConfig()
    this._remaking = 1

    let g = 1
    ;['', '2'].map(dual => {
      if (dual == '2' && self._mySettings.get_string('button-position') == self._mySettings.get_string('button-position2'))
        return

      let j = 1
      const position = self._mySettings.get_string('button-position' + dual)
      const box_ref = ({
        'L': Main.panel._leftBox,
        'M': Main.panel._centerBox,
        'R': Main.panel._rightBox
      })[position[0]]
      const box_name = ({
        'L': 'left',
        'M': 'center',
        'R': 'right'
      })[position[0]]
      const start_position = ({
        'L': 0,
        '1': 1,
        '9': box_ref.get_n_children() - 1,
        'R': box_ref.get_n_children()
      })[position[1]]
      const numButtons = self._mySettings.get_value('num-buttons' + dual).deep_unpack()
      const skipLocal = self._mySettings.get_boolean('hide-local')
      let done = 0
      self._buttons.map(x => {
        if (skipLocal && x._lbt.tzSameAsLocal()) { return }
        done += 1
        if (done < g) { return }
        if (j <= numButtons) {
          x.refresh()
          Main.panel.addToStatusArea('worldClock' + g, x, start_position + j - 1, box_name)
          j += 1
          g += 1
        }
      })
    })

    this._remaking = 0
  }

  _refreshLocations () {
    const world_clocks = this._clocksSettings.get_value('world-clocks')
    const self = this
    this._locations = world_clocks.deep_unpack()
      .map(e => this._world.deserialize(e.location))
      .filter(e => e.get_timezone())
      .map(e => new LocationBasedTime(e, self))

    this._remakeButtons()
  }

  _refreshAll () {
    this._buttons.map(x => x.refresh())
  }

  enable () {
    this._clocksSettings = getClocksSettings()
    this._enableSuccess = true
    this._remaking = 0

    this._nextTicks = []
    this._buttons = []

    this._world = GWeather.Location.get_world()
    this._clock = new GnomeDesktop.WallClock()
    this._theme = new St.IconTheme()

    this._mySettings = this.getSettings()
    this._gnomeClockSettings = new Gio.Settings({ schema: 'org.gnome.desktop.interface' })

    // rtl time fix
    this._lang_is_rtl = (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL)

    this._refreshLocations()

    this._clock.connect('notify::clock', this._refreshAll.bind(this))
    this._gnomeClockSettings.connect('changed::clock-format', this._refreshAll.bind(this))
    this._clocksSettings.connect('changed::world-clocks', this._refreshLocations.bind(this))
    this._mySettings.connect('changed', this._remakeButtons.bind(this))
    this._clock.connect('notify::timezone', this._remakeButtons.bind(this))
  }


  disable () {
    if (!this._enableSuccess)
      return

    this._nextTicks.map(e => GLib.Source.remove(e))
    this._nextTicks = []

    this._locations = []
    this._buttons.map(x => x.destroy())
    this._buttons = []

    this._theme = null
    this._clock = null
    this._world = null

    this._gnomeClockSettings = null
    this._clocksSettings = null
    this._mySettings = null

    this._enableSuccess = false
  }
}

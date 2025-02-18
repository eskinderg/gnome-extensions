import GLib from 'gi://GLib';

export default class Sound {
  static playError() {
    GLib.spawn_command_line_async("paplay --volume=65536 /usr/share/sounds/sound-icons/prompt.wav");
  }
}


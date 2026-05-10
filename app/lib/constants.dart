/// Mithobasai web shell configuration.
///
/// Override at build time, for example:
/// `flutter run --dart-define=INITIAL_WEB_URL=http://10.0.2.2:5173/`
/// (Android emulator → host Vite dev server).
abstract final class AppConstants {
  static const String initialUrl = String.fromEnvironment(
    'INITIAL_WEB_URL',
    defaultValue: 'https://mithobasai.com/',
  );
}

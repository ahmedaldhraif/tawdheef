#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shellapi.h>
#include <wchar.h>

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR command, int show) {
  (void)instance; (void)previous; (void)command; (void)show;
  int argc = 0; LPWSTR *argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  BOOL quiet = argc == 2 && wcscmp(argv[1], L"--no-open") == 0;
  if (!argv || (argc > 1 && !quiet)) { if (argv) LocalFree(argv); return 2; }
  LocalFree(argv);
  WCHAR root[32768], executable[32768], script[32768], line[65536];
  DWORD length = GetModuleFileNameW(NULL, root, 32768);
  if (!length || length >= 32768) return 1;
  WCHAR *separator = wcsrchr(root, L'\\'); if (!separator) return 1; *separator = 0;
  if (swprintf_s(executable, 32768, L"%s\\runtime\\node.exe", root) < 0 || swprintf_s(script, 32768, L"%s\\scripts\\native-start.mjs", root) < 0) return 1;
  if (swprintf_s(line, 65536, L"\"%s\" \"%s\"%s", executable, script, quiet ? L" --no-open" : L"") < 0) return 1;
  STARTUPINFOW startup; PROCESS_INFORMATION process;
  ZeroMemory(&startup, sizeof(startup)); ZeroMemory(&process, sizeof(process)); startup.cb = sizeof(startup);
  HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE), err = GetStdHandle(STD_ERROR_HANDLE);
  if (out && out != INVALID_HANDLE_VALUE && err && err != INVALID_HANDLE_VALUE) {
    startup.dwFlags = STARTF_USESTDHANDLES; startup.hStdOutput = out; startup.hStdError = err; startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  }
  if (!CreateProcessW(executable, line, NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, root, &startup, &process)) {
    if (!quiet) MessageBoxW(NULL, L"Keep the complete Tawdheef folder together and try again. Your saved data was not moved.", L"Tawdheef could not start", MB_OK | MB_ICONERROR);
    return 1;
  }
  WaitForSingleObject(process.hProcess, INFINITE); DWORD status = 1; GetExitCodeProcess(process.hProcess, &status);
  CloseHandle(process.hThread); CloseHandle(process.hProcess);
  if (status && !quiet) MessageBoxW(NULL, L"Tawdheef could not finish startup. Use the diagnostic guide to inspect its background log.", L"Tawdheef could not start", MB_OK | MB_ICONERROR);
  return (int)status;
}

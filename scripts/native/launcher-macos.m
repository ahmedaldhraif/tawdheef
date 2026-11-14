#import <Cocoa/Cocoa.h>
#include <stdio.h>
#include <string.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    BOOL quiet = argc == 2 && strcmp(argv[1], "--no-open") == 0;
    if (argc > 1 && !quiet) return 2;
    NSString *bundle = [[NSBundle mainBundle] bundlePath];
    NSString *root = [bundle stringByAppendingPathComponent:@"Contents/Resources/app"];
    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:[root stringByAppendingPathComponent:@"runtime/bin/node"]];
    task.currentDirectoryURL = [NSURL fileURLWithPath:root];
    task.arguments = quiet ? @[[root stringByAppendingPathComponent:@"scripts/native-start.mjs"], @"--no-open"] : @[[root stringByAppendingPathComponent:@"scripts/native-start.mjs"]];
    NSPipe *output = [NSPipe pipe];
    task.standardOutput = output; task.standardError = output;
    NSError *error = nil;
    BOOL launched = [task launchAndReturnError:&error];
    NSData *log = launched ? [[output fileHandleForReading] readDataToEndOfFile] : nil;
    if (launched) [task waitUntilExit];
    int status = launched ? task.terminationStatus : 1;
    if (quiet && log.length) fwrite(log.bytes, 1, log.length, status ? stderr : stdout);
    if (status && !quiet) {
      [NSApplication sharedApplication];
      [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
      [NSApp activateIgnoringOtherApps:YES];
      NSAlert *alert = [[NSAlert alloc] init];
      alert.messageText = @"Tawdheef could not start";
      alert.informativeText = @"Keep the complete app together and try again. Your saved data was not moved. Use the diagnostic guide for the background log.";
      [alert addButtonWithTitle:@"OK"]; [alert runModal];
    }
    return status;
  }
}

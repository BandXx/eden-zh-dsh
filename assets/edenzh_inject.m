// Eden 汉化补丁 — 运行时注入器（源码，供 DSH 插件在目标机上现编）
// 编译：clang -dynamiclib -fobjc-arc -fmodules -framework Cocoa -framework WebKit \
//         -o libEdenZh.dylib edenzh_inject.m && codesign --force --sign - libEdenZh.dylib
// 运行时从 EDEN_ZH_DIR（或 dylib 同目录 / 主 bundle Resources）读取 eden-zh.js + eden-zh.json，
// 通过 WKUserScript 注入，把 WebView 界面里的英文替换为简体中文。
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#import <objc/runtime.h>
#include <dlfcn.h>

static NSString *const kHandlerName = @"edenZhI18n";

static NSString *EdenZhDir(void) {
    NSString *p = NSProcessInfo.processInfo.environment[@"EDEN_ZH_DIR"];
    if (p.length) return p;
    Dl_info info;
    if (dladdr((void *)&EdenZhDir, &info) && info.dli_fname) {
        NSString *self0 = [NSString stringWithUTF8String:info.dli_fname];
        NSString *dir = [self0 stringByDeletingLastPathComponent];
        if ([NSFileManager.defaultManager fileExistsAtPath:[dir stringByAppendingPathComponent:@"eden-zh.js"]])
            return dir;
    }
    return [NSBundle.mainBundle resourcePath];
}

static NSString *EdenZhReadFile(NSString *name, NSString *fallback) {
    NSString *p = [EdenZhDir() stringByAppendingPathComponent:name];
    NSString *s = [NSString stringWithContentsOfFile:p encoding:NSUTF8StringEncoding error:NULL];
    if (!s.length) { NSLog(@"[EdenZh] missing %@", p); return fallback; }
    NSLog(@"[EdenZh] loaded %@ (%lu chars)", p, (unsigned long)s.length);
    return s;
}

static NSString *EdenZhJSONLiteral(NSString *json) {
    NSMutableString *q = [NSMutableString stringWithString:@"\""];
    NSUInteger n = json.length;
    for (NSUInteger i = 0; i < n; i++) {
        unichar c = [json characterAtIndex:i];
        if (c == '"' || c == '\\') [q appendFormat:@"\\%C", c];
        else if (c == '\n') [q appendString:@"\\n"];
        else if (c == '\r') [q appendString:@"\\r"];
        else if (c == '\t') [q appendString:@"\\t"];
        else [q appendFormat:@"%C", c];
    }
    [q appendString:@"\""];
    return q;
}

static NSString *EdenZhBuildSource(void) {
    static NSString *cached;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSString *dict = EdenZhReadFile(@"eden-zh.json", @"{}");
        NSString *js = EdenZhReadFile(@"eden-zh.js", @"");
        if (!js.length) { cached = @""; return; }
        cached = [NSString stringWithFormat:@"window.__EDEN_ZH_JSON__=%@;\n%@",
                  EdenZhJSONLiteral(dict), js];
    });
    return cached;
}

@interface EdenZhLog : NSObject <WKScriptMessageHandler>
@end
@implementation EdenZhLog
- (void)userContentController:(WKUserContentController *)u didReceiveScriptMessage:(WKScriptMessage *)m {
    NSLog(@"[EdenZh] %@", m.body);
}
@end

static EdenZhLog *EdenZhLogShared(void) {
    static EdenZhLog *h; static dispatch_once_t o;
    dispatch_once(&o, ^{ h = [EdenZhLog new]; });
    return h;
}

@implementation WKWebView (EdenZhInject)
- (instancetype)edenZh_initWithFrame:(CGRect)frame configuration:(WKWebViewConfiguration *)configuration {
    @try {
        WKUserContentController *ucc = configuration.userContentController;
        if (!ucc) { ucc = [WKUserContentController new]; configuration.userContentController = ucc; }
        [ucc addScriptMessageHandler:EdenZhLogShared() name:kHandlerName];
        // 让 Intl / Date 默认按简体中文格式化（月份、星期、日期）
        NSString *localeProbe = @"(function(){try{var L='zh-CN';var lang=function(){return L;};"
        "Object.defineProperty(navigator,'language',{get:lang,configurable:true});"
        "Object.defineProperty(navigator,'languages',{get:function(){return [L,'zh'];},configurable:true});"
        "}catch(e){}})();";
        [ucc addUserScript:[[WKUserScript alloc] initWithSource:localeProbe
                                                  injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                                               forMainFrameOnly:NO]];
        NSString *src = EdenZhBuildSource();
        if (src.length) {
            WKUserScript *us = [[WKUserScript alloc] initWithSource:src
                                                       injectionTime:WKUserScriptInjectionTimeAtDocumentEnd
                                                    forMainFrameOnly:NO];
            [ucc addUserScript:us];
        }
    } @catch (NSException *e) { NSLog(@"[EdenZh] inject failed: %@", e); }
    return [self edenZh_initWithFrame:frame configuration:configuration];
}
@end

__attribute__((constructor)) static void EdenZhInstall(void) {
    Class cls = NSClassFromString(@"WKWebView");
    SEL orig = @selector(initWithFrame:configuration:);
    SEL swiz = @selector(edenZh_initWithFrame:configuration:);
    Method m1 = class_getInstanceMethod(cls, orig);
    Method m2 = class_getInstanceMethod(cls, swiz);
    if (m1 && m2) {
        class_addMethod(cls, swiz, method_getImplementation(m2), method_getTypeEncoding(m2));
        method_exchangeImplementations(class_getInstanceMethod(cls, orig), class_getInstanceMethod(cls, swiz));
        NSLog(@"[EdenZh] swizzle installed");
    } else {
        NSLog(@"[EdenZh] swizzle target missing");
    }
}

#!/usr/bin/env python3
"""Патчит android/app/build.gradle (или .kts) под нашу сборку APK.

Задачи:
  1. release-вариант подписывается debug-ключом — APK можно ставить сразу,
     без своего keystore (иначе gradle вообще не отдаст release-сборку).
  2. Нативные .so лежат в APK несжатыми (useLegacyPackaging = true):
     пакет становится заметно тяжелее и ставится быстрее.
  3. Минификация/шейк ресурсов выключены — режем ничего не будем,
     игра и так одна страница.

Скрипт идемпотентен: повторный запуск ничего не ломает.
"""
import os
import re
import sys


def patch_groovy(path):
    src = open(path, encoding='utf-8').read()
    orig = src

    if 'useLegacyPackaging' not in src:
        block = (
            'android {\n'
            '    // нативные библиотеки храним в APK несжатыми: пакет крупнее, установка быстрее\n'
            '    packagingOptions {\n'
            '        jniLibs {\n'
            '            useLegacyPackaging = true\n'
            '        }\n'
            '    }\n'
        )
        src = src.replace('android {', block, 1)

    if 'signingConfig signingConfigs.debug' not in src:
        src = re.sub(
            r'(release\s*\{)',
            r'\1\n            signingConfig signingConfigs.debug',
            src, count=1)

    src = re.sub(r'minifyEnabled\s+(?:true|false)', 'minifyEnabled false', src)
    src = re.sub(r'shrinkResources\s+(?:true|false)', 'shrinkResources false', src)

    if src != orig:
        open(path, 'w', encoding='utf-8').write(src)
        print('пропатчен (groovy):', path)
    else:
        print('без изменений:', path)


def patch_kts(path):
    src = open(path, encoding='utf-8').read()
    orig = src

    if 'useLegacyPackaging' not in src:
        block = (
            'android {\n'
            '    // нативные библиотеки храним в APK несжатыми: пакет крупнее, установка быстрее\n'
            '    packaging {\n'
            '        jniLibs {\n'
            '            useLegacyPackaging = true\n'
            '        }\n'
            '    }\n'
        )
        src = src.replace('android {', block, 1)

    if 'signingConfigs.getByName("debug")' not in src:
        src = re.sub(
            r'(getByName\("release"\)\s*\{)',
            r'\1\n            signingConfig = signingConfigs.getByName("debug")',
            src, count=1)

    src = src.replace('isMinifyEnabled = true', 'isMinifyEnabled = false')
    src = src.replace('isShrinkResources = true', 'isShrinkResources = false')

    if src != orig:
        open(path, 'w', encoding='utf-8').write(src)
        print('пропатчен (kts):', path)
    else:
        print('без изменений:', path)


def main(argv):
    touched = 0
    for path in argv:
        if not os.path.isfile(path):
            continue
        if path.endswith('.kts'):
            patch_kts(path)
        else:
            patch_groovy(path)
        touched += 1
    if touched == 0:
        print('Файлы gradle не найдены:', ', '.join(argv))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

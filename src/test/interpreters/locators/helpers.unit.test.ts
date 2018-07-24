// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

// tslint:disable:max-func-body-length

import { expect } from 'chai';
import * as path from 'path';
import * as TypeMoq from 'typemoq';
import { EnumEx } from '../../../client/common/enumUtils';
import { Architecture, IFileSystem, IPlatformService } from '../../../client/common/platform/types';
import { PythonVersionInfo } from '../../../client/common/process/types';
import { IInterpreterLocatorHelper, IInterpreterService, InterpreterType, PythonInterpreter } from '../../../client/interpreter/contracts';
import { InterpreterLocatorHelper } from '../../../client/interpreter/locators/helpers';
import { IServiceContainer } from '../../../client/ioc/types';

enum OS {
    Windows = 'Windows',
    Linux = 'Linux',
    Mac = 'Mac'
}

suite('Interpreters - Locators Helper', () => {
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let platform: TypeMoq.IMock<IPlatformService>;
    let helper: IInterpreterLocatorHelper;
    let fs: TypeMoq.IMock<IFileSystem>;
    let interpreterService: TypeMoq.IMock<IInterpreterService>;
    setup(() => {
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        platform = TypeMoq.Mock.ofType<IPlatformService>();
        fs = TypeMoq.Mock.ofType<IFileSystem>();
        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        serviceContainer.setup(c => c.get(TypeMoq.It.isValue(IPlatformService))).returns(() => platform.object);
        serviceContainer.setup(c => c.get(TypeMoq.It.isValue(IFileSystem))).returns(() => fs.object);
        serviceContainer.setup(c => c.get(TypeMoq.It.isValue(IInterpreterService))).returns(() => interpreterService.object);

        helper = new InterpreterLocatorHelper(serviceContainer.object);
    });
    test('Ensure default Mac interpreters are excluded from the list of interpreters', async () => {
        platform.setup(p => p.isWindows).returns(() => false);
        platform.setup(p => p.isLinux).returns(() => false);
        platform
            .setup(p => p.isMac).returns(() => true)
            .verifiable(TypeMoq.Times.atLeastOnce());
        fs
            .setup(f => f.arePathsSame(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => false)
            .verifiable(TypeMoq.Times.atLeastOnce());

        const interpreters: PythonInterpreter[] = [];
        const macInterpreterPath = path.join('users', 'python', 'bin', 'mac');
        ['conda', 'virtualenv', 'mac', 'pyenv'].forEach(name => {
            const interpreter = {
                architecture: Architecture.Unknown,
                displayName: name,
                path: path.join('users', 'python', 'bin', name),
                sysPrefix: name,
                sysVersion: name,
                type: InterpreterType.Unknown,
                version: name,
                version_info: [0, 0, 0, 'alpha'] as PythonVersionInfo
            };
            interpreters.push(interpreter);

            // Treat 'mac' as as mac interpreter.
            interpreterService
                .setup(i => i.isMacDefaultPythonPath(TypeMoq.It.isValue(interpreter.path)))
                .returns(() => name === 'mac')
                .verifiable(TypeMoq.Times.once());
        });

        const expectedInterpreters = interpreters.filter(item => item.path !== macInterpreterPath);

        const items = helper.mergeInterpreters(interpreters);

        interpreterService.verifyAll();
        platform.verifyAll();
        fs.verifyAll();
        expect(items).to.be.lengthOf(3);
        expect(items).to.be.deep.equal(expectedInterpreters);
    });
    EnumEx.getNamesAndValues<OS>(OS).forEach(os => {
        test(`Ensure duplicates are removed (same version and same interpreter directory on ${os.name})`, async () => {
            interpreterService
                .setup(i => i.isMacDefaultPythonPath(TypeMoq.It.isAny()))
                .returns(() => false);
            platform.setup(p => p.isWindows).returns(() => os.value === OS.Windows);
            platform.setup(p => p.isLinux).returns(() => os.value === OS.Linux);
            platform.setup(p => p.isMac).returns(() => os.value === OS.Mac);
            fs
                .setup(f => f.arePathsSame(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .returns((a, b) => {
                    if (a === b && a === path.join('users', 'python', 'bin', '3.6')) {
                        return true;
                    }
                    if (a === b && a === path.join('users', 'python', 'bin', '3.7')) {
                        return true;
                    }
                    return false;
                })
                .verifiable(TypeMoq.Times.atLeastOnce());

            const interpreters: PythonInterpreter[] = [];
            const expectedInterpreters: PythonInterpreter[] = [];
            // Unique python paths and versions.
            ['3.6', '3.6', '2.7', '2.7'].forEach((name, index) => {
                const interpreter = {
                    architecture: Architecture.Unknown,
                    displayName: name,
                    path: path.join('users', `python${name}`, 'bin', name + index.toString()),
                    sysPrefix: name,
                    sysVersion: name,
                    type: InterpreterType.Unknown,
                    version: name,
                    version_info: [3, parseInt(name.substr(-1), 10), 0, 'final'] as PythonVersionInfo
                };
                interpreters.push(interpreter);
                expectedInterpreters.push(interpreter);
            });
            // These are duplicates.
            ['3.6', '3.6', '3.7', '3.7'].forEach((name, index) => {
                const interpreter = {
                    architecture: Architecture.Unknown,
                    displayName: name,
                    path: path.join('users', 'python', 'bin', 'python.exe'),
                    sysPrefix: name,
                    sysVersion: name,
                    type: InterpreterType.Unknown,
                    version: name,
                    version_info: [3, parseInt(name.substr(-1), 10), 0, 'final'] as PythonVersionInfo
                };

                const duplicateInterpreter = {
                    architecture: Architecture.Unknown,
                    displayName: name,
                    path: path.join('users', 'python', 'bin', `python${name}.exe`),
                    sysPrefix: name,
                    sysVersion: name,
                    type: InterpreterType.Unknown,
                    version: name,
                    version_info: [3, parseInt(name.substr(-1), 10), 0, 'final'] as PythonVersionInfo
                };

                interpreters.push(duplicateInterpreter);
                interpreters.push(interpreter);
                if (index % 2 === 1) {
                    expectedInterpreters.push(interpreter);
                }
            });
            // // Same versions but in the same directory.
            // ['3.6', '2.7'].forEach(name => {
            //     const interpreter = {
            //         architecture: Architecture.Unknown,
            //         displayName: name,
            //         path: path.join('users', 'python', 'bin', '3.7'),
            //         sysPrefix: name,
            //         sysVersion: name,
            //         type: InterpreterType.Unknown,
            //         version: name,
            //         version_info: [2, 7, 0, 'final'] as PythonVersionInfo
            //     };
            //     interpreters.push(interpreter);
            //     expectedInterpreters.push(interpreter);
            // });

            const items = helper.mergeInterpreters(interpreters);

            interpreterService.verifyAll();
            platform.verifyAll();
            fs.verifyAll();
            expect(items).to.be.lengthOf(expectedInterpreters.length);
            expect(items).to.be.deep.equal(expectedInterpreters);
        });
    });
});

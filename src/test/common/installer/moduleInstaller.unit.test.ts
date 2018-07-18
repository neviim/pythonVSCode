// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

// tslint:disable:no-any max-func-body-length no-invalid-this

import * as path from 'path';
import * as TypeMoq from 'typemoq';
import { Disposable, OutputChannel, Uri, WorkspaceConfiguration } from 'vscode';
import { IWorkspaceService } from '../../../client/common/application/types';
import { noop } from '../../../client/common/core.utils';
import { EnumEx } from '../../../client/common/enumUtils';
import { CondaInstaller } from '../../../client/common/installer/condaInstaller';
import { PipEnvInstaller, pipenvName } from '../../../client/common/installer/pipEnvInstaller';
import { PipInstaller } from '../../../client/common/installer/pipInstaller';
import { ProductInstaller } from '../../../client/common/installer/productInstaller';
import { IInstallationChannelManager, IModuleInstaller } from '../../../client/common/installer/types';
import { PythonVersionInfo } from '../../../client/common/process/types';
import { ITerminalService, ITerminalServiceFactory } from '../../../client/common/terminal/types';
import { IConfigurationService, IDisposableRegistry, IPythonSettings, ModuleNamePurpose, Product } from '../../../client/common/types';
import { ICondaService, IInterpreterService, InterpreterType, PythonInterpreter } from '../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../client/ioc/types';

/* Complex test to ensure we cover all combinations:
We could have written separate tests for each installer, but we'd be replicate code.
Both approachs have their benefits.

Comnbinations of:
1. With and without a workspace.
2. Http Proxy configuration.
3. All products.
4. Different versions of Python.
5. With and without conda.
6. Conda environments with names and without names.
7. All installers.
*/
suite('Module Installer', () => {
    const pythonPath = path.join(__dirname, 'python');
    [CondaInstaller, PipInstaller, PipEnvInstaller].forEach(installerClass => {
        suite(installerClass.name, () => {
            ['', 'proxy:1234'].forEach(proxyServer => {
                [undefined, Uri.file('/users/dev/xyz')].forEach(resource => {
                    const versions: PythonVersionInfo[] = [[2, 7, 0, 'final'], [3, 4, 0, 'final'], [3, 5, 0, 'final'], [3, 6, 0, 'final'], [3, 7, 0, 'final']];
                    const interpreterInfos = versions.map(version => {
                        const info = TypeMoq.Mock.ofType<PythonInterpreter>();
                        info.setup((t: any) => t.then).returns(() => undefined);
                        info.setup(t => t.type).returns(() => InterpreterType.VirtualEnv);
                        info.setup(t => t.version_info).returns(() => [2, 7, 0, 'final']);
                        return info;
                    });
                    [undefined, ...interpreterInfos].forEach(interpreterInfo => {
                        suite(`Python Version: ${interpreterInfo ? interpreterInfo.object.version_info.join('.') : 'Unknown'}`, () => {
                            [undefined, { name: 'My-Env01', path: '' }, { name: '', path: '/conda/path' }].forEach(condaEnvInfo => {
                                EnumEx.getNamesAndValues<Product>(Product).forEach(product => {
                                    suite(product.name, () => {
                                        suite(`Resource ${resource}`, () => {
                                            let disposables: Disposable[] = [];
                                            let installer: IModuleInstaller;
                                            let installationChannel: TypeMoq.IMock<IInstallationChannelManager>;
                                            let serviceContainer: TypeMoq.IMock<IServiceContainer>;
                                            let terminalService: TypeMoq.IMock<ITerminalService>;
                                            let pythonSettings: TypeMoq.IMock<IPythonSettings>;
                                            let interpreterService: TypeMoq.IMock<IInterpreterService>;
                                            let moduleName = '';
                                            const condaExecutable = 'my.exe';
                                            setup(function () {
                                                serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();

                                                const mockOutChnl = TypeMoq.Mock.ofType<OutputChannel>().object;
                                                try {
                                                    const prodInstaller = new ProductInstaller(serviceContainer.object, mockOutChnl);
                                                    moduleName = prodInstaller.translateProductToModuleName(product.value, ModuleNamePurpose.install);
                                                } catch {
                                                    return this.skip();
                                                }

                                                disposables = [];
                                                serviceContainer.setup(c => c.get(TypeMoq.It.isValue(IDisposableRegistry), TypeMoq.It.isAny())).returns(() => disposables);

                                                installationChannel = TypeMoq.Mock.ofType<IInstallationChannelManager>();
                                                serviceContainer.setup(c => c.get(TypeMoq.It.isValue(IInstallationChannelManager), TypeMoq.It.isAny())).returns(() => installationChannel.object);

                                                const condaService = TypeMoq.Mock.ofType<ICondaService>();
                                                condaService.setup(c => c.getCondaFile()).returns(() => Promise.resolve(condaExecutable));
                                                condaService.setup(c => c.getCondaEnvironment(TypeMoq.It.isAny())).returns(() => Promise.resolve(condaEnvInfo));

                                                const configService = TypeMoq.Mock.ofType<IConfigurationService>();
                                                serviceContainer.setup(c => c.get(TypeMoq.It.isValue(IConfigurationService), TypeMoq.It.isAny())).returns(() => configService.object);
                                                pythonSettings = TypeMoq.Mock.ofType<IPythonSettings>();
                                                pythonSettings.setup(p => p.pythonPath).returns(() => pythonPath);
                                                configService.setup(c => c.getSettings(TypeMoq.It.isAny())).returns(() => pythonSettings.object);

                                                terminalService = TypeMoq.Mock.ofType<ITerminalService>();
                                                const terminalServiceFactory = TypeMoq.Mock.ofType<ITerminalServiceFactory>();
                                                terminalServiceFactory.setup(f => f.getTerminalService(TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns(() => terminalService.object);
                                                serviceContainer.setup(c => c.get(TypeMoq.It.isValue(ITerminalServiceFactory), TypeMoq.It.isAny())).returns(() => terminalServiceFactory.object);

                                                interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
                                                serviceContainer.setup(c => c.get(TypeMoq.It.isValue(IInterpreterService), TypeMoq.It.isAny())).returns(() => interpreterService.object);
                                                serviceContainer.setup(c => c.get(TypeMoq.It.isValue(ICondaService), TypeMoq.It.isAny())).returns(() => condaService.object);

                                                const workspaceService = TypeMoq.Mock.ofType<IWorkspaceService>();
                                                serviceContainer.setup(c => c.get(TypeMoq.It.isValue(IWorkspaceService), TypeMoq.It.isAny())).returns(() => workspaceService.object);
                                                const http = TypeMoq.Mock.ofType<WorkspaceConfiguration>();
                                                http.setup(h => h.get(TypeMoq.It.isValue('proxy'), TypeMoq.It.isAny())).returns(() => proxyServer);
                                                workspaceService.setup(w => w.getConfiguration(TypeMoq.It.isValue('http'))).returns(() => http.object);

                                                interpreterService
                                                    .setup(i => i.getActiveInterpreter(TypeMoq.It.isValue(resource)))
                                                    .returns(() => Promise.resolve(interpreterInfo ? interpreterInfo.object : undefined))
                                                    .verifiable(TypeMoq.Times.atLeastOnce());

                                                installer = new installerClass(serviceContainer.object);
                                            });
                                            teardown(() => {
                                                disposables.forEach(disposable => {
                                                    if (disposable) {
                                                        disposable.dispose();
                                                    }
                                                });
                                            });
                                            if (product.value !== Product.pylint) {
                                                if (installerClass === PipInstaller) {
                                                    test('Ensure getActiveInterperter is used in PipInstaller', async () => {
                                                        try {
                                                            await installer.installModule(product.name, resource);
                                                        } catch {
                                                            noop();
                                                        }
                                                        interpreterService.verifyAll();
                                                    });
                                                }
                                                if (installerClass === PipInstaller) {
                                                    test('Test Args', async () => {
                                                        const proxyArgs = proxyServer.length === 0 ? [] : ['--proxy', proxyServer];
                                                        const expectedArgs = ['-m', 'pip', ...proxyArgs, 'install', '-U', moduleName];
                                                        terminalService.setup(t => t.sendCommand(TypeMoq.It.isAny(), TypeMoq.It.isValue(expectedArgs)))
                                                            .returns(() => Promise.resolve())
                                                            .verifiable(TypeMoq.Times.once());

                                                        await installer.installModule(moduleName, resource);
                                                        interpreterService.verifyAll();
                                                        terminalService.verifyAll();
                                                    });
                                                }
                                                if (installerClass === PipEnvInstaller) {
                                                    test('Test args', async () => {
                                                        const expectedArgs = ['install', moduleName, '--dev'];
                                                        terminalService.setup(t => t.sendCommand(TypeMoq.It.isValue(pipenvName), TypeMoq.It.isValue(expectedArgs)))
                                                            .returns(() => Promise.resolve())
                                                            .verifiable(TypeMoq.Times.once());

                                                        await installer.installModule(moduleName, resource);
                                                        terminalService.verifyAll();
                                                    });
                                                }
                                                if (installerClass === CondaInstaller) {
                                                    test('Test args', async () => {
                                                        const expectedArgs = ['install'];
                                                        if (condaEnvInfo && condaEnvInfo.name) {
                                                            expectedArgs.push('--name');
                                                            expectedArgs.push(condaEnvInfo.name);
                                                        } else if (condaEnvInfo && condaEnvInfo.path) {
                                                            expectedArgs.push('--prefix');
                                                            expectedArgs.push(condaEnvInfo.path);
                                                        }
                                                        expectedArgs.push(moduleName);
                                                        terminalService.setup(t => t.sendCommand(TypeMoq.It.isValue(condaExecutable), TypeMoq.It.isValue(expectedArgs)))
                                                            .returns(() => Promise.resolve())
                                                            .verifiable(TypeMoq.Times.once());

                                                        await installer.installModule(moduleName, resource);
                                                        terminalService.verifyAll();
                                                    });
                                                }
                                            }
                                            if (product.value === Product.pylint && interpreterInfo && interpreterInfo.object.version_info[0] === 2) {
                                                if (installerClass === PipInstaller) {
                                                    test('Ensure install arg is \'Pylint<2.0.0\'', async () => {
                                                        const proxyArgs = proxyServer.length === 0 ? [] : ['--proxy', proxyServer];
                                                        const expectedArgs = ['-m', 'pip', ...proxyArgs, 'install', '-U', '"pylint<2.0.0"'];
                                                        terminalService.setup(t => t.sendCommand(TypeMoq.It.isAny(), TypeMoq.It.isValue(expectedArgs)))
                                                            .returns(() => Promise.resolve())
                                                            .verifiable(TypeMoq.Times.once());

                                                        await installer.installModule(moduleName, resource);
                                                        interpreterService.verifyAll();
                                                        terminalService.verifyAll();
                                                    });
                                                }
                                                if (installerClass === PipEnvInstaller) {
                                                    test('Ensure install arg is \'Pylint<2.0.0\'', async () => {
                                                        const expectedArgs = ['install', '"pylint<2.0.0"', '--dev'];
                                                        terminalService.setup(t => t.sendCommand(TypeMoq.It.isValue(pipenvName), TypeMoq.It.isValue(expectedArgs)))
                                                            .returns(() => Promise.resolve())
                                                            .verifiable(TypeMoq.Times.once());

                                                        await installer.installModule(moduleName, resource);
                                                        terminalService.verifyAll();
                                                    });
                                                }
                                                if (installerClass === CondaInstaller) {
                                                    test('Ensure install arg is \'Pylint<2.0.0\'', async () => {
                                                        const expectedArgs = ['install'];
                                                        if (condaEnvInfo && condaEnvInfo.name) {
                                                            expectedArgs.push('--name');
                                                            expectedArgs.push(condaEnvInfo.name);
                                                        } else if (condaEnvInfo && condaEnvInfo.path) {
                                                            expectedArgs.push('--prefix');
                                                            expectedArgs.push(condaEnvInfo.path);
                                                        }
                                                        expectedArgs.push('"pylint<2.0.0"');
                                                        terminalService.setup(t => t.sendCommand(TypeMoq.It.isValue(condaExecutable), TypeMoq.It.isValue(expectedArgs)))
                                                            .returns(() => Promise.resolve())
                                                            .verifiable(TypeMoq.Times.once());

                                                        await installer.installModule(moduleName, resource);
                                                        terminalService.verifyAll();
                                                    });
                                                }
                                            }
                                            if (product.value === Product.pylint && interpreterInfo && interpreterInfo.object.version_info[0] === 3) {
                                                if (installerClass === PipInstaller) {
                                                    test('Ensure install arg is \'pylint\'', async () => {
                                                        const proxyArgs = proxyServer.length === 0 ? [] : ['--proxy', proxyServer];
                                                        const expectedArgs = ['-m', 'pip', ...proxyArgs, 'install', '-U', 'pylint'];
                                                        terminalService.setup(t => t.sendCommand(TypeMoq.It.isAny(), TypeMoq.It.isValue(expectedArgs)))
                                                            .returns(() => Promise.resolve())
                                                            .verifiable(TypeMoq.Times.once());

                                                        await installer.installModule(moduleName, resource);
                                                        interpreterService.verifyAll();
                                                        terminalService.verifyAll();
                                                    });
                                                }
                                                if (installerClass === PipEnvInstaller) {
                                                    test('Ensure install arg is \'pylint\'', async () => {
                                                        const expectedArgs = ['install', 'pylint', '--dev'];
                                                        terminalService.setup(t => t.sendCommand(TypeMoq.It.isValue(pipenvName), TypeMoq.It.isValue(expectedArgs)))
                                                            .returns(() => Promise.resolve())
                                                            .verifiable(TypeMoq.Times.once());

                                                        await installer.installModule(moduleName, resource);
                                                        terminalService.verifyAll();
                                                    });
                                                }
                                                if (installerClass === CondaInstaller) {
                                                    test('Ensure install arg is \'pylint\'', async () => {
                                                        const expectedArgs = ['install'];
                                                        if (condaEnvInfo && condaEnvInfo.name) {
                                                            expectedArgs.push('--name');
                                                            expectedArgs.push(condaEnvInfo.name);
                                                        } else if (condaEnvInfo && condaEnvInfo.path) {
                                                            expectedArgs.push('--prefix');
                                                            expectedArgs.push(condaEnvInfo.path);
                                                        }
                                                        expectedArgs.push('pylint');
                                                        terminalService.setup(t => t.sendCommand(TypeMoq.It.isValue(condaExecutable), TypeMoq.It.isValue(expectedArgs)))
                                                            .returns(() => Promise.resolve())
                                                            .verifiable(TypeMoq.Times.once());

                                                        await installer.installModule(moduleName, resource);
                                                        terminalService.verifyAll();
                                                    });
                                                }
                                            }
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

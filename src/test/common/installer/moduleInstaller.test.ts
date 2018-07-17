// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

// tslint:disable:no-any max-func-body-length

import { expect } from 'chai';
import * as path from 'path';
import * as TypeMoq from 'typemoq';
import { Disposable } from 'vscode';
import { createDeferred } from '../../../client/common/helpers';
import { CondaInstaller } from '../../../client/common/installer/condaInstaller';
import { PipEnvInstaller } from '../../../client/common/installer/pipEnvInstaller';
import { PipInstaller } from '../../../client/common/installer/pipInstaller';
import { IInstallationChannelManager, IModuleInstaller } from '../../../client/common/installer/types';
import { ITerminalService, ITerminalServiceFactory } from '../../../client/common/terminal/types';
import { IConfigurationService, IDisposableRegistry, IPythonSettings } from '../../../client/common/types';
import { ICondaService, IInterpreterService, InterpreterType, PythonInterpreter } from '../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../client/ioc/types';
import { initialize } from '../../initialize';

suite('Module Installer-x', () => {
    const pythonPath = path.join(__dirname, 'python');
    suiteSetup(initialize);
    [CondaInstaller, PipInstaller, PipEnvInstaller].forEach(installerClass => {
        let disposables: Disposable[] = [];
        let installer: IModuleInstaller;
        let installationChannel: TypeMoq.IMock<IInstallationChannelManager>;
        let serviceContainer: TypeMoq.IMock<IServiceContainer>;
        let terminalService: TypeMoq.IMock<ITerminalService>;
        let pythonSettings: TypeMoq.IMock<IPythonSettings>;
        let interpreterService: TypeMoq.IMock<IInterpreterService>;
        setup(() => {
            serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();

            disposables = [];
            serviceContainer.setup(c => c.get(TypeMoq.It.isValue(IDisposableRegistry), TypeMoq.It.isAny())).returns(() => disposables);

            installationChannel = TypeMoq.Mock.ofType<IInstallationChannelManager>();
            serviceContainer.setup(c => c.get(TypeMoq.It.isValue(IInstallationChannelManager), TypeMoq.It.isAny())).returns(() => installationChannel.object);

            const condaService = TypeMoq.Mock.ofType<ICondaService>();
            condaService.setup(c => c.getCondaFile()).returns(() => Promise.resolve('conda'));
            condaService.setup(c => c.getCondaEnvironment(TypeMoq.It.isAny())).returns(() => Promise.resolve(undefined));

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

            installer = new installerClass(serviceContainer.object);
        });
        teardown(() => {
            disposables.forEach(disposable => {
                if (disposable) {
                    disposable.dispose();
                }
            });
        });
        test(`Ensure getActiveInterperter is used (${installerClass.name})`, async () => {
            if (installer.displayName !== 'Pip') {
                return;
            }
            interpreterService.setup(i => i.getActiveInterpreter(TypeMoq.It.isAny())).returns(() => Promise.resolve(undefined)).verifiable();
            try {
                await installer.installModule('xyz');
                // tslint:disable-next-line:no-empty
            } catch { }
            interpreterService.verifyAll();
        });
        test(`Ensure Pylint~=2.0.0 is used (${installerClass.name})`, async () => {
            const activeInterpreterInfo = TypeMoq.Mock.ofType<PythonInterpreter>();
            activeInterpreterInfo.setup((t: any) => t.then).returns(() => undefined);
            activeInterpreterInfo.setup(t => t.type).returns(() => InterpreterType.VirtualEnv);
            activeInterpreterInfo.setup(t => t.version_info).returns(() => [2, 7, 0, 'final']);
            interpreterService.setup(i => i.getActiveInterpreter(TypeMoq.It.isAny())).returns(() => Promise.resolve(activeInterpreterInfo.object)).verifiable();
            const argsPromise = createDeferred<string[]>();
            terminalService.setup(t => t.sendCommand(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
                .callback((_cmd, args) => argsPromise.resolve(args))
                .returns(() => Promise.resolve());
                // .verifiable(TypeMoq.Times.once());

            await installer.installModule('pylint').ignoreErrors();
            await argsPromise.promise;
            interpreterService.verifyAll();
            // terminalService.verifyAll();
            const x = await argsPromise.promise;
            expect(await argsPromise.promise).to.include('"pylint<=2.0.0"');
        });
    });
});

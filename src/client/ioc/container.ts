// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { EventEmitter } from 'events';
import { Container, decorate, injectable, interfaces } from 'inversify';
import { noop } from '../common/core.utils';
import { Abstract, IServiceContainer, Newable } from './types';

// This needs to be done once, hence placed in a common location.
// Used by UnitTestSockerServer and also the extension unit tests.
// Place within try..catch, as this can only be done once. Possible another extesion
// would perform this before our extension.
try {
    decorate(injectable(), EventEmitter);
} catch {
    noop();
}

@injectable()
export class ServiceContainer implements IServiceContainer {
    constructor(private container: Container) { }
    public get<T>(serviceIdentifier: interfaces.ServiceIdentifier<T>, name?: string | number | symbol): T {
        return name ? this.container.getNamed<T>(serviceIdentifier, name) : this.container.get<T>(serviceIdentifier);
    }
    public getAll<T>(serviceIdentifier: string | symbol | Newable<T> | Abstract<T>, name?: string | number | symbol | undefined): T[] {
        return name ? this.container.getAllNamed<T>(serviceIdentifier, name) : this.container.getAll<T>(serviceIdentifier);
    }
}

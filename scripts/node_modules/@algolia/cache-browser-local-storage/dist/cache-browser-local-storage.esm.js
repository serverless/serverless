function createBrowserLocalStorageCache(options) {
    const namespaceKey = `algoliasearch-client-js-${options.key}`;
    // eslint-disable-next-line functional/no-let
    let storage;
    const getStorage = () => {
        if (storage === undefined) {
            storage = options.localStorage || window.localStorage;
        }
        return storage;
    };
    const getNamespace = () => {
        return JSON.parse(getStorage().getItem(namespaceKey) || '{}');
    };
    const setNamespace = (namespace) => {
        getStorage().setItem(namespaceKey, JSON.stringify(namespace));
    };
    const removeOutdatedCacheItems = () => {
        const timeToLive = options.timeToLive ? options.timeToLive * 1000 : null;
        const namespace = getNamespace();
        const filteredNamespaceWithoutOldFormattedCacheItems = Object.fromEntries(Object.entries(namespace).filter(([, cacheItem]) => {
            return cacheItem.timestamp !== undefined;
        }));
        setNamespace(filteredNamespaceWithoutOldFormattedCacheItems);
        if (!timeToLive)
            return;
        const filteredNamespaceWithoutExpiredItems = Object.fromEntries(Object.entries(filteredNamespaceWithoutOldFormattedCacheItems).filter(([, cacheItem]) => {
            const currentTimestamp = new Date().getTime();
            const isExpired = cacheItem.timestamp + timeToLive < currentTimestamp;
            return !isExpired;
        }));
        setNamespace(filteredNamespaceWithoutExpiredItems);
    };
    return {
        get(key, defaultValue, events = {
            miss: () => Promise.resolve(),
        }) {
            return Promise.resolve()
                .then(() => {
                removeOutdatedCacheItems();
                const keyAsString = JSON.stringify(key);
                return getNamespace()[keyAsString];
            })
                .then(value => {
                return Promise.all([value ? value.value : defaultValue(), value !== undefined]);
            })
                .then(([value, exists]) => {
                return Promise.all([value, exists || events.miss(value)]);
            })
                .then(([value]) => value);
        },
        set(key, value) {
            return Promise.resolve().then(() => {
                const namespace = getNamespace();
                // eslint-disable-next-line functional/immutable-data
                namespace[JSON.stringify(key)] = {
                    timestamp: new Date().getTime(),
                    value,
                };
                getStorage().setItem(namespaceKey, JSON.stringify(namespace));
                return value;
            });
        },
        delete(key) {
            return Promise.resolve().then(() => {
                const namespace = getNamespace();
                // eslint-disable-next-line functional/immutable-data
                delete namespace[JSON.stringify(key)];
                getStorage().setItem(namespaceKey, JSON.stringify(namespace));
            });
        },
        clear() {
            return Promise.resolve().then(() => {
                getStorage().removeItem(namespaceKey);
            });
        },
    };
}

export { createBrowserLocalStorageCache };

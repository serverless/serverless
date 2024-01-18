def async_context_manager(context_manager):
    class AsyncContextManager(context_manager):
        async def __aenter__(self):
            self.__enter__()

        async def __aexit__(self, exc_type, exc, tb):
            self.__exit__(exc_type, exc, tb)

    return AsyncContextManager

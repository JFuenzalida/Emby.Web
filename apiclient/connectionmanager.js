﻿(function (globalScope) {

    if (!globalScope.MediaBrowser) {
        globalScope.MediaBrowser = {};
    }

    globalScope.MediaBrowser.ConnectionState = {
        Unavailable: 0,
        ServerSelection: 1,
        ServerSignIn: 2,
        SignedIn: 3,
        ConnectSignIn: 4
    };

    globalScope.MediaBrowser.ConnectionMode = {
        Local: 0,
        Remote: 1,
        Manual: 2
    };

    globalScope.MediaBrowser.ServerInfo = {

        getServerAddress: function (server, mode) {

            switch (mode) {
                case MediaBrowser.ConnectionMode.Local:
                    return server.LocalAddress;
                case MediaBrowser.ConnectionMode.Manual:
                    return server.ManualAddress;
                case MediaBrowser.ConnectionMode.Remote:
                    return server.RemoteAddress;
                default:
                    return server.ManualAddress || server.LocalAddress || server.RemoteAddress;
            }
        }
    };

    globalScope.MediaBrowser.ConnectionManager = function (logger, credentialProvider, appName, appVersion, deviceName, deviceId, capabilities) {

        logger.log('Begin MediaBrowser.ConnectionManager constructor');

        var self = this;
        var apiClients = [];
        var defaultTimeout = 20000;

        function mergeServers(list1, list2) {

            for (var i = 0, length = list2.length; i < length; i++) {
                credentialProvider.addOrUpdateServer(list1, list2[i]);
            }

            return list1;
        }

        function resolveFailure(resolve) {

            resolve({
                State: MediaBrowser.ConnectionState.Unavailable,
                ConnectUser: self.connectUser()
            });
        }

        function updateServerInfo(server, systemInfo) {

            server.Name = systemInfo.ServerName;
            server.Id = systemInfo.Id;

            if (systemInfo.LocalAddress) {
                server.LocalAddress = systemInfo.LocalAddress;
            }
            if (systemInfo.WanAddress) {
                server.RemoteAddress = systemInfo.WanAddress;
            }
            if (systemInfo.MacAddress) {
                server.WakeOnLanInfos = [
                        { MacAddress: systemInfo.MacAddress }
                ];
            }
        }

        function getEmbyServerUrl(baseUrl, handler) {
            return baseUrl + "/emby/" + handler;
        }

        function getFetchPromise(request) {

            var headers = request.headers || {};

            if (request.dataType == 'json') {
                headers.accept = 'application/json';
            }

            var fetchRequest = {
                headers: headers,
                method: request.type
            };

            var contentType = request.contentType;

            if (request.data) {

                if (typeof request.data === 'string') {
                    fetchRequest.body = request.data;
                } else {
                    fetchRequest.body = paramsToString(request.data);

                    contentType = contentType || 'application/x-www-form-urlencoded; charset=UTF-8';
                }
            }

            if (contentType) {

                headers['Content-Type'] = contentType;
            }

            if (!request.timeout) {
                return fetch(request.url, fetchRequest);
            }

            return fetchWithTimeout(request.url, fetchRequest, request.timeout);
        }

        function fetchWithTimeout(url, options, timeoutMs) {

            logger.log('fetchWithTimeout: timeoutMs: ' + timeoutMs + ', url: ' + url);

            return new Promise(function (resolve, reject) {

                var timeout = setTimeout(reject, timeoutMs);

                fetch(url, options).then(function (response) {
                    clearTimeout(timeout);

                    logger.log('fetchWithTimeout: succeeded connecting to url: ' + url);

                    resolve(response);
                }, function (error) {

                    clearTimeout(timeout);

                    logger.log('fetchWithTimeout: timed out connecting to url: ' + url);

                    throw error;
                });
            });
        }

        function paramsToString(params) {

            var values = [];

            for (var key in params) {

                var value = params[key];

                if (value !== null && value !== undefined && value !== '') {
                    values.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
                }
            }
            return values.join('&');
        }

        function ajax(request) {

            if (!request) {
                throw new Error("Request cannot be null");
            }

            request.headers = request.headers || {};

            logger.log('ConnectionManager requesting url: ' + request.url);

            return getFetchPromise(request).then(function (response) {

                logger.log('ConnectionManager response status: ' + response.status + ', url: ' + request.url);

                if (response.status < 400) {

                    if (request.dataType == 'json' || request.headers.accept == 'application/json') {
                        return response.json();
                    } else {
                        return response;
                    }
                } else {
                    return Promise.reject(response);
                }

            }, function (err) {

                logger.log('ConnectionManager request failed to url: ' + request.url);
                throw err;
            });
        }

        function tryConnect(url, timeout) {

            url = getEmbyServerUrl(url, "system/info/public");

            logger.log('tryConnect url: ' + url);

            return ajax({

                type: "GET",
                url: url,
                dataType: "json",

                timeout: timeout || defaultTimeout

            });
        }

        var connectUser;
        self.connectUser = function () {
            return connectUser;
        };

        self.appVersion = function () {
            return appVersion;
        };

        self.capabilities = function () {
            return capabilities;
        };

        self.deviceId = function () {
            return deviceId;
        };

        self.credentialProvider = function () {
            return credentialProvider;
        };

        self.connectUserId = function () {
            return credentialProvider.credentials().ConnectUserId;
        };

        self.connectToken = function () {

            return credentialProvider.credentials().ConnectAccessToken;
        };

        self.getServerInfo = function (id) {

            var servers = credentialProvider.credentials().Servers;

            return servers.filter(function (s) {

                return s.Id == id;

            })[0];
        };

        self.getLastUsedServer = function () {

            var servers = credentialProvider.credentials().Servers;

            servers.sort(function (a, b) {
                return (b.DateLastAccessed || 0) - (a.DateLastAccessed || 0);
            });

            if (!servers.length) {
                return null;
            }

            return servers[0];
        };

        self.getLastUsedApiClient = function () {

            var servers = credentialProvider.credentials().Servers;

            servers.sort(function (a, b) {
                return (b.DateLastAccessed || 0) - (a.DateLastAccessed || 0);
            });

            if (!servers.length) {
                return null;
            }

            var server = servers[0];

            return getOrAddApiClient(server, server.LastConnectionMode);
        };

        self.addApiClient = function (apiClient) {

            apiClients.push(apiClient);

            var existingServers = credentialProvider.credentials().Servers.filter(function (s) {

                return stringEqualsIgnoreCase(s.ManualAddress, apiClient.serverAddress()) ||
                    stringEqualsIgnoreCase(s.LocalAddress, apiClient.serverAddress()) ||
                    stringEqualsIgnoreCase(s.RemoteAddress, apiClient.serverAddress());

            });

            var existingServer = existingServers.length ? existingServers[0] : {};
            existingServer.DateLastAccessed = new Date().getTime();
            existingServer.LastConnectionMode = MediaBrowser.ConnectionMode.Manual;
            if (existingServer.LastConnectionMode == MediaBrowser.ConnectionMode.Local) {
                existingServer.DateLastLocalConnection = new Date().getTime();
            }
            existingServer.ManualAddress = apiClient.serverAddress();
            apiClient.serverInfo(existingServer);

            apiClient.onAuthenticated = function (instance, result) {
                onAuthenticated(instance, result, {}, true);
            };

            if (!existingServers.length) {
                var credentials = credentialProvider.credentials();
                credentials.Servers = [existingServer];
                credentialProvider.credentials(credentials);
            }

            Events.trigger(self, 'apiclientcreated', [apiClient]);

            if (existingServer.Id) {
                return;
            }

            apiClient.getPublicSystemInfo().then(function (systemInfo) {

                var credentials = credentialProvider.credentials();
                existingServer.Id = systemInfo.Id;
                apiClient.serverInfo(existingServer);

                credentials.Servers = [existingServer];
                credentialProvider.credentials(credentials);
            });
        };

        self.clearData = function () {

            logger.log('connection manager clearing data');

            connectUser = null;
            var credentials = credentialProvider.credentials();
            credentials.ConnectAccessToken = null;
            credentials.ConnectUserId = null;
            credentials.Servers = [];
            credentialProvider.credentials(credentials);
        };

        function onConnectUserSignIn(user) {

            connectUser = user;
            Events.trigger(self, 'connectusersignedin', [user]);
        }

        function getOrAddApiClient(server, connectionMode) {

            var apiClient = self.getApiClient(server.Id);

            if (!apiClient) {

                var url = MediaBrowser.ServerInfo.getServerAddress(server, connectionMode);

                apiClient = new MediaBrowser.ApiClient(logger, url, appName, appVersion, deviceName, deviceId);

                apiClients.push(apiClient);

                apiClient.serverInfo(server);

                apiClient.onAuthenticated = function (instance, result) {
                    onAuthenticated(instance, result, {}, true);
                };

                Events.trigger(self, 'apiclientcreated', [apiClient]);
            }

            logger.log('returning instance from getOrAddApiClient');
            return apiClient;
        }

        self.getOrCreateApiClient = function (serverId) {

            var credentials = credentialProvider.credentials();
            var servers = credentials.Servers.filter(function (s) {
                return stringEqualsIgnoreCase(s.Id, serverId);

            });

            if (!servers.length) {
                throw new Error('Server not found: ' + serverId);
            }

            var server = servers[0];

            return getOrAddApiClient(server, server.LastConnectionMode);
        };

        function onAuthenticated(apiClient, result, options, saveCredentials) {

            var credentials = credentialProvider.credentials();
            var servers = credentials.Servers.filter(function (s) {
                return s.Id == result.ServerId;
            });

            var server = servers.length ? servers[0] : apiClient.serverInfo();

            if (options.updateDateLastAccessed !== false) {
                server.DateLastAccessed = new Date().getTime();

                if (server.LastConnectionMode == MediaBrowser.ConnectionMode.Local) {
                    server.DateLastLocalConnection = new Date().getTime();
                }
            }
            server.Id = result.ServerId;

            if (saveCredentials) {
                server.UserId = result.User.Id;
                server.AccessToken = result.AccessToken;
            } else {
                server.UserId = null;
                server.AccessToken = null;
            }

            credentialProvider.addOrUpdateServer(credentials.Servers, server);
            saveUserInfoIntoCredentials(server, result.User);
            credentialProvider.credentials(credentials);

            afterConnected(apiClient, options);

            onLocalUserSignIn(result.User);
        }

        function saveUserInfoIntoCredentials(server, user) {

            var info = {
                Id: user.Id,
                IsSignedInOffline: true
            }

            credentialProvider.addOrUpdateUser(server, info);
        }

        function afterConnected(apiClient, options) {

            options = options || {};

            if (options.reportCapabilities !== false) {
                apiClient.reportCapabilities(capabilities);
            }

            if (options.enableWebSocket !== false) {
                if (!apiClient.isWebSocketOpenOrConnecting && apiClient.isWebSocketSupported()) {
                    logger.log('calling apiClient.openWebSocket');

                    apiClient.openWebSocket();
                }
            }
        }

        function onLocalUserSignIn(user) {

            Events.trigger(self, 'localusersignedin', [user]);
        }

        function ensureConnectUser(credentials) {

            return new Promise(function (resolve, reject) {

                if (connectUser && connectUser.Id == credentials.ConnectUserId) {
                    resolve();
                }

                else if (credentials.ConnectUserId && credentials.ConnectAccessToken) {

                    connectUser = null;

                    getConnectUser(credentials.ConnectUserId, credentials.ConnectAccessToken).then(function (user) {

                        onConnectUserSignIn(user);
                        resolve();

                    }, function () {
                        resolve();
                    });

                } else {
                    resolve();
                }
            });
        }

        function getConnectUser(userId, accessToken) {

            if (!userId) {
                throw new Error("null userId");
            }
            if (!accessToken) {
                throw new Error("null accessToken");
            }

            var url = "https://connect.emby.media/service/user?id=" + userId;

            return ajax({
                type: "GET",
                url: url,
                dataType: "json",
                headers: {
                    "X-Application": appName + "/" + appVersion,
                    "X-Connect-UserToken": accessToken
                }

            });
        }

        function addAuthenticationInfoFromConnect(server, connectionMode, credentials) {

            if (!server.ExchangeToken) {
                throw new Error("server.ExchangeToken cannot be null");
            }
            if (!credentials.ConnectUserId) {
                throw new Error("credentials.ConnectUserId cannot be null");
            }

            var url = MediaBrowser.ServerInfo.getServerAddress(server, connectionMode);

            url = getEmbyServerUrl(url, "Connect/Exchange?format=json&ConnectUserId=" + credentials.ConnectUserId);

            return ajax({
                type: "GET",
                url: url,
                dataType: "json",
                headers: {
                    "X-MediaBrowser-Token": server.ExchangeToken
                }

            }).then(function (auth) {

                server.UserId = auth.LocalUserId;
                server.AccessToken = auth.AccessToken;
                return auth;

            }, function () {

                server.UserId = null;
                server.AccessToken = null;
                return Promise.reject();

            });
        }

        function validateAuthentication(server, connectionMode) {

            return new Promise(function (resolve, reject) {

                var url = MediaBrowser.ServerInfo.getServerAddress(server, connectionMode);

                ajax({

                    type: "GET",
                    url: getEmbyServerUrl(url, "System/Info"),
                    dataType: "json",
                    headers: {
                        "X-MediaBrowser-Token": server.AccessToken
                    }

                }).then(function (systemInfo) {

                    updateServerInfo(server, systemInfo);

                    if (server.UserId) {

                        ajax({

                            type: "GET",
                            url: getEmbyServerUrl(url, "users/" + server.UserId),
                            dataType: "json",
                            headers: {
                                "X-MediaBrowser-Token": server.AccessToken
                            }

                        }).then(function (user) {

                            onLocalUserSignIn(user);
                            resolve();

                        }, function () {

                            server.UserId = null;
                            server.AccessToken = null;
                            resolve();
                        });
                    }

                }, function () {

                    server.UserId = null;
                    server.AccessToken = null;
                    resolve();
                });
            });
        }

        function getImageUrl(localUser) {

            if (connectUser && connectUser.ImageUrl) {
                return {
                    url: connectUser.ImageUrl
                };
            }
            if (localUser && localUser.PrimaryImageTag) {

                var apiClient = self.getApiClient(localUser);

                var url = apiClient.getUserImageUrl(localUser.Id, {
                    tag: localUser.PrimaryImageTag,
                    type: "Primary"
                });

                return {
                    url: url,
                    supportsParams: true
                };
            }

            return {
                url: null,
                supportsParams: false
            };
        }

        self.user = function (apiClient) {

            return new Promise(function (resolve, reject) {

                var localUser;

                function onLocalUserDone(e) {

                    var image = getImageUrl(localUser);

                    resolve({
                        localUser: localUser,
                        name: connectUser ? connectUser.Name : (localUser ? localUser.Name : null),
                        canManageServer: localUser ? localUser.Policy.IsAdministrator : false,
                        imageUrl: image.url,
                        supportsImageParams: image.supportsParams
                    });
                }

                function onEnsureConnectUserDone() {

                    if (apiClient && apiClient.getCurrentUserId()) {
                        apiClient.getCurrentUser().then(function (u) {
                            localUser = u;
                            onLocalUserDone();

                        }, onLocalUserDone);
                    } else {
                        onLocalUserDone();
                    }
                }

                var credentials = credentialProvider.credentials();

                if (credentials.ConnectUserId && credentials.ConnectAccessToken && !(apiClient && apiClient.getCurrentUserId())) {
                    ensureConnectUser(credentials).then(onEnsureConnectUserDone, onEnsureConnectUserDone);
                } else {
                    onEnsureConnectUserDone();
                }
            });
        };

        self.isLoggedIntoConnect = function () {

            // Make sure it returns true or false
            if (!self.connectToken() || !self.connectUserId()) {
                return false;
            }
            return true;
        };

        self.logout = function () {

            Logger.log('begin connectionManager loguot');
            var promises = [];

            for (var i = 0, length = apiClients.length; i < length; i++) {

                var apiClient = apiClients[i];

                if (apiClient.accessToken()) {
                    promises.push(logoutOfServer(apiClient));
                }
            }

            return Promise.all(promises).then(function () {

                var credentials = credentialProvider.credentials();

                var servers = credentials.Servers.filter(function (u) {
                    return u.UserLinkType != "Guest";
                });

                for (var j = 0, numServers = servers.length; j < numServers; j++) {

                    var server = servers[j];

                    server.UserId = null;
                    server.AccessToken = null;
                    server.ExchangeToken = null;

                    var serverUsers = server.Users || [];

                    for (var k = 0, numUsers = serverUsers.length; k < numUsers; k++) {

                        serverUsers[k].IsSignedInOffline = false;
                    }
                }

                credentials.Servers = servers;
                credentials.ConnectAccessToken = null;
                credentials.ConnectUserId = null;

                credentialProvider.credentials(credentials);

                if (connectUser) {
                    connectUser = null;
                    Events.trigger(self, 'connectusersignedout');
                }
            });
        };

        function logoutOfServer(apiClient) {

            var serverInfo = apiClient.serverInfo() || {};

            var logoutInfo = {
                serverId: serverInfo.Id
            };

            return apiClient.logout().then(function () {

                Events.trigger(self, 'localusersignedout', [logoutInfo]);
            }, function () {

                Events.trigger(self, 'localusersignedout', [logoutInfo]);
            });
        }

        function getConnectServers(credentials) {

            logger.log('Begin getConnectServers');

            return new Promise(function (resolve, reject) {

                if (!credentials.ConnectAccessToken || !credentials.ConnectUserId) {
                    resolve([]);
                    return;
                }

                var url = "https://connect.emby.media/service/servers?userId=" + credentials.ConnectUserId;

                ajax({
                    type: "GET",
                    url: url,
                    dataType: "json",
                    headers: {
                        "X-Application": appName + "/" + appVersion,
                        "X-Connect-UserToken": credentials.ConnectAccessToken
                    }

                }).then(function (servers) {

                    servers = servers.map(function (i) {
                        return {
                            ExchangeToken: i.AccessKey,
                            ConnectServerId: i.Id,
                            Id: i.SystemId,
                            Name: i.Name,
                            RemoteAddress: i.Url,
                            LocalAddress: i.LocalAddress,
                            UserLinkType: (i.UserType || '').toLowerCase() == "guest" ? "Guest" : "LinkedUser"
                        };
                    });

                    resolve(servers);

                }, function () {
                    resolve([]);

                });
            });
        }

        self.getSavedServers = function () {

            var credentials = credentialProvider.credentials();

            var servers = credentials.Servers.slice(0);

            servers.sort(function (a, b) {
                return (b.DateLastAccessed || 0) - (a.DateLastAccessed || 0);
            });

            return servers;
        };

        self.getAvailableServers = function () {

            logger.log('Begin getAvailableServers');

            // Clone the array
            var credentials = credentialProvider.credentials();

            return Promise.all([getConnectServers(credentials), findServers()]).then(function (responses) {

                var connectServers = responses[0];
                var foundServers = responses[1];

                var servers = credentials.Servers.slice(0);
                mergeServers(servers, foundServers);
                mergeServers(servers, connectServers);

                servers = filterServers(servers, connectServers);

                servers.sort(function (a, b) {
                    return (b.DateLastAccessed || 0) - (a.DateLastAccessed || 0);
                });

                credentials.Servers = servers;

                credentialProvider.credentials(credentials);

                return servers;
            });
        };

        function filterServers(servers, connectServers) {

            return servers.filter(function (server) {

                // It's not a connect server, so assume it's still valid
                if (!server.ExchangeToken) {
                    return true;
                }

                return connectServers.filter(function (connectServer) {

                    return server.Id == connectServer.Id;

                }).length > 0;
            });
        }

        function findServers() {

            return new Promise(function (resolve, reject) {

                require(['serverdiscovery'], function () {
                    ServerDiscovery.findServers(1000).then(function (foundServers) {

                        var servers = foundServers.map(function (foundServer) {

                            var info = {
                                Id: foundServer.Id,
                                LocalAddress: foundServer.Address,
                                Name: foundServer.Name,
                                ManualAddress: convertEndpointAddressToManualAddress(foundServer),
                                DateLastLocalConnection: new Date().getTime()
                            };

                            info.LastConnectionMode = info.ManualAddress ? MediaBrowser.ConnectionMode.Manual : MediaBrowser.ConnectionMode.Local;

                            return info;
                        });
                        resolve(servers);
                    });

                });
            });
        }

        function convertEndpointAddressToManualAddress(info) {

            if (info.Address && info.EndpointAddress) {
                var address = info.EndpointAddress.split(":")[0];

                // Determine the port, if any
                var parts = info.Address.split(":");
                if (parts.length > 1) {
                    var portString = parts[parts.length - 1];

                    if (!isNaN(parseInt(portString))) {
                        address += ":" + portString;
                    }
                }

                return normalizeAddress(address);
            }

            return null;
        }

        self.connect = function () {

            logger.log('Begin connect');

            return new Promise(function (resolve, reject) {

                self.getAvailableServers().then(function (servers) {

                    self.connectToServers(servers).then(function (result) {

                        resolve(result);
                    });
                });
            });
        };

        self.getOffineResult = function () {

            // TODO: Implement
        };

        self.connectToServers = function (servers) {

            logger.log('Begin connectToServers, with ' + servers.length + ' servers');

            return new Promise(function (resolve, reject) {

                if (servers.length == 1) {

                    self.connectToServer(servers[0]).then(function (result) {

                        if (result.State == MediaBrowser.ConnectionState.Unavailable) {

                            result.State = result.ConnectUser == null ?
                                MediaBrowser.ConnectionState.ConnectSignIn :
                                MediaBrowser.ConnectionState.ServerSelection;
                        }

                        logger.log('resolving connectToServers with result.State: ' + result.State);
                        resolve(result);

                    });

                } else {

                    var firstServer = servers.length ? servers[0] : null;
                    // See if we have any saved credentials and can auto sign in
                    if (firstServer) {
                        self.connectToServer(firstServer).then(function (result) {

                            if (result.State == MediaBrowser.ConnectionState.SignedIn) {

                                resolve(result);

                            } else {
                                resolve({
                                    Servers: servers,
                                    State: (!servers.length && !self.connectUser()) ? MediaBrowser.ConnectionState.ConnectSignIn : MediaBrowser.ConnectionState.ServerSelection,
                                    ConnectUser: self.connectUser()
                                });
                            }

                        });
                    } else {

                        resolve({
                            Servers: servers,
                            State: (!servers.length && !self.connectUser()) ? MediaBrowser.ConnectionState.ConnectSignIn : MediaBrowser.ConnectionState.ServerSelection,
                            ConnectUser: self.connectUser()
                        });
                    }
                }

            });
        };

        function beginWakeServer(server) {

            require(['wakeonlan'], function () {
                var infos = server.WakeOnLanInfos || [];

                for (var i = 0, length = infos.length; i < length; i++) {

                    WakeOnLan.send(infos[i]);
                }
            });
        }

        self.connectToServer = function (server, options) {

            return new Promise(function (resolve, reject) {

                var tests = [];

                if (server.LastConnectionMode != null) {
                    //tests.push(server.LastConnectionMode);
                }
                if (tests.indexOf(MediaBrowser.ConnectionMode.Manual) == -1) { tests.push(MediaBrowser.ConnectionMode.Manual); }
                if (tests.indexOf(MediaBrowser.ConnectionMode.Local) == -1) { tests.push(MediaBrowser.ConnectionMode.Local); }
                if (tests.indexOf(MediaBrowser.ConnectionMode.Remote) == -1) { tests.push(MediaBrowser.ConnectionMode.Remote); }

                beginWakeServer(server);

                var wakeOnLanSendTime = new Date().getTime();

                options = options || {};
                testNextConnectionMode(tests, 0, server, wakeOnLanSendTime, options, resolve);
            });
        };

        function stringEqualsIgnoreCase(str1, str2) {

            return (str1 || '').toLowerCase() == (str2 || '').toLowerCase();
        }

        function testNextConnectionMode(tests, index, server, wakeOnLanSendTime, options, resolve) {

            if (index >= tests.length) {

                logger.log('Tested all connection modes. Failing server connection.');
                resolveFailure(resolve);
                return;
            }

            var mode = tests[index];
            var address = MediaBrowser.ServerInfo.getServerAddress(server, mode);
            var enableRetry = false;
            var skipTest = false;
            var timeout = defaultTimeout;

            if (mode == MediaBrowser.ConnectionMode.Local) {

                enableRetry = true;
                timeout = 8000;
            }

            else if (mode == MediaBrowser.ConnectionMode.Manual) {

                if (stringEqualsIgnoreCase(address, server.LocalAddress) ||
                        stringEqualsIgnoreCase(address, server.RemoteAddress)) {
                    skipTest = true;
                }
            }

            if (skipTest || !address) {
                testNextConnectionMode(tests, index + 1, server, wakeOnLanSendTime, options, resolve);
                return;
            }

            logger.log('testing connection mode ' + mode + ' with server ' + server.Name);

            tryConnect(address, timeout).then(function (result) {

                logger.log('calling onSuccessfulConnection with connection mode ' + mode + ' with server ' + server.Name);
                onSuccessfulConnection(server, result, mode, options, resolve);

            }, function () {

                logger.log('test failed for connection mode ' + mode + ' with server ' + server.Name);

                if (enableRetry) {

                    var sleepTime = 10000 - (new Date().getTime() - wakeOnLanSendTime);

                    // TODO: Implement delay and retry

                    testNextConnectionMode(tests, index + 1, server, wakeOnLanSendTime, options, resolve);

                } else {
                    testNextConnectionMode(tests, index + 1, server, wakeOnLanSendTime, options, resolve);

                }
            });
        }

        function onSuccessfulConnection(server, systemInfo, connectionMode, options, resolve) {

            var credentials = credentialProvider.credentials();
            if (credentials.ConnectAccessToken) {

                ensureConnectUser(credentials).then(function () {

                    if (server.ExchangeToken) {
                        addAuthenticationInfoFromConnect(server, connectionMode, credentials).then(function () {

                            afterConnectValidated(server, credentials, systemInfo, connectionMode, true, options, resolve);

                        }, function () {

                            afterConnectValidated(server, credentials, systemInfo, connectionMode, true, options, resolve);
                        });

                    } else {

                        afterConnectValidated(server, credentials, systemInfo, connectionMode, true, options, resolve);
                    }
                });
            }
            else {
                afterConnectValidated(server, credentials, systemInfo, connectionMode, true, options, resolve);
            }
        }

        function afterConnectValidated(server, credentials, systemInfo, connectionMode, verifyLocalAuthentication, options, resolve) {

            if (verifyLocalAuthentication && server.AccessToken) {

                validateAuthentication(server, connectionMode).then(function () {

                    afterConnectValidated(server, credentials, systemInfo, connectionMode, false, options, resolve);
                });

                return;
            }

            updateServerInfo(server, systemInfo);

            server.LastConnectionMode = connectionMode;

            if (options.updateDateLastAccessed !== false) {
                server.DateLastAccessed = new Date().getTime();

                if (server.LastConnectionMode == MediaBrowser.ConnectionMode.Local) {
                    server.DateLastLocalConnection = new Date().getTime();
                }
            }
            credentialProvider.addOrUpdateServer(credentials.Servers, server);
            credentialProvider.credentials(credentials);

            var result = {
                Servers: []
            };

            result.ApiClient = getOrAddApiClient(server, connectionMode);
            result.State = server.AccessToken ?
                MediaBrowser.ConnectionState.SignedIn :
                MediaBrowser.ConnectionState.ServerSignIn;

            result.Servers.push(server);
            result.ApiClient.updateServerInfo(server, connectionMode);

            if (result.State == MediaBrowser.ConnectionState.SignedIn) {
                afterConnected(result.ApiClient, options);
            }

            resolve(result);

            Events.trigger(self, 'connected', [result]);
        }

        function normalizeAddress(address) {

            // attempt to correct bad input
            address = address.trim();

            if (address.toLowerCase().indexOf('http') != 0) {
                address = "http://" + address;
            }

            // Seeing failures in iOS when protocol isn't lowercase
            address = address.replace('Http:', 'http:');
            address = address.replace('Https:', 'https:');

            return address;
        }

        self.connectToAddress = function (address) {

            return new Promise(function (resolve, reject) {

                if (!address) {
                    reject();
                    return;
                }

                address = normalizeAddress(address);

                function onFail() {
                    logger.log('connectToAddress ' + address + ' failed');
                    resolveFailure(resolve);
                }

                tryConnect(address, defaultTimeout).then(function (publicInfo) {

                    logger.log('connectToAddress ' + address + ' succeeded');

                    var server = {
                        ManualAddress: address,
                        LastConnectionMode: MediaBrowser.ConnectionMode.Manual
                    };
                    updateServerInfo(server, publicInfo);

                    self.connectToServer(server).then(resolve, onFail);

                }, onFail);

            });
        };

        self.loginToConnect = function (username, password) {

            return new Promise(function (resolve, reject) {

                if (!username) {
                    reject();
                    return;
                }
                if (!password) {
                    reject();
                    return;
                }

                require(['connectservice', 'cryptojs-md5'], function () {

                    var md5 = self.getConnectPasswordHash(password);

                    ajax({
                        type: "POST",
                        url: "https://connect.emby.media/service/user/authenticate",
                        data: {
                            nameOrEmail: username,
                            password: md5
                        },
                        dataType: "json",
                        contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
                        headers: {
                            "X-Application": appName + "/" + appVersion
                        }

                    }).then(function (result) {

                        var credentials = credentialProvider.credentials();

                        credentials.ConnectAccessToken = result.AccessToken;
                        credentials.ConnectUserId = result.User.Id;

                        credentialProvider.credentials(credentials);

                        onConnectUserSignIn(result.User);

                        resolve(result);

                    }, reject);
                });
            });
        };

        self.signupForConnect = function (email, username, password, passwordConfirm) {

            return new Promise(function (resolve, reject) {

                if (!email) {
                    reject({ errorCode: 'invalidinput' });
                    return;
                }
                if (!username) {
                    reject({ errorCode: 'invalidinput' });
                    return;
                }
                if (!password) {
                    reject({ errorCode: 'invalidinput' });
                    return;
                }
                if (!passwordConfirm) {
                    reject({ errorCode: 'passwordmatch' });
                    return;
                }
                if (password != passwordConfirm) {
                    reject({ errorCode: 'passwordmatch' });
                    return;
                }

                require(['connectservice', 'cryptojs-md5'], function () {

                    var md5 = self.getConnectPasswordHash(password);

                    ajax({
                        type: "POST",
                        url: "https://connect.emby.media/service/register",
                        data: {
                            email: email,
                            userName: username,
                            password: md5
                        },
                        dataType: "json",
                        contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
                        headers: {
                            "X-Application": appName + "/" + appVersion,
                            "X-CONNECT-TOKEN": "CONNECT-REGISTER"
                        }

                    }).then(resolve, function (response) {

                        try {
                            return response.json();

                        } catch (err) {
                            reject();
                        }

                    }).then(function (result) {

                        if (result && result.Status) {
                            reject({ errorCode: result.Status });
                        }

                    }, reject);
                });
            });
        };

        self.getConnectPasswordHash = function (password) {

            password = globalScope.MediaBrowser.ConnectService.cleanPassword(password);

            return CryptoJS.MD5(password).toString();
        };

        self.getApiClient = function (item) {

            // Accept string + object
            if (item.ServerId) {
                item = item.ServerId;
            }

            return apiClients.filter(function (a) {

                var serverInfo = a.serverInfo();

                // We have to keep this hack in here because of the addApiClient method
                return !serverInfo || serverInfo.Id == item;

            })[0];
        };

        self.getUserInvitations = function () {

            var connectToken = self.connectToken();

            if (!connectToken) {
                throw new Error("null connectToken");
            }
            if (!self.connectUserId()) {
                throw new Error("null connectUserId");
            }

            var url = "https://connect.emby.media/service/servers?userId=" + self.connectUserId() + "&status=Waiting";

            return ajax({
                type: "GET",
                url: url,
                dataType: "json",
                headers: {
                    "X-Connect-UserToken": connectToken,
                    "X-Application": appName + "/" + appVersion
                }

            });
        };

        self.deleteServer = function (serverId) {

            if (!serverId) {
                throw new Error("null serverId");
            }

            var server = credentialProvider.credentials().Servers.filter(function (s) {
                return s.Id == serverId;
            });
            server = server.length ? server[0] : null;

            return new Promise(function (resolve, reject) {

                function onDone() {
                    var credentials = credentialProvider.credentials();

                    credentials.Servers = credentials.Servers.filter(function (s) {
                        return s.Id != serverId;
                    });

                    credentialProvider.credentials(credentials);
                    resolve();
                }

                if (!server.ConnectServerId) {
                    onDone();
                    return;
                }

                var connectToken = self.connectToken();
                var connectUserId = self.connectUserId();

                if (!connectToken || !connectUserId) {
                    onDone();
                    return;
                }

                var url = "https://connect.emby.media/service/serverAuthorizations?serverId=" + server.ConnectServerId + "&userId=" + connectUserId;

                ajax({
                    type: "DELETE",
                    url: url,
                    headers: {
                        "X-Connect-UserToken": connectToken,
                        "X-Application": appName + "/" + appVersion
                    }

                }).then(onDone, onDone);
            });
        };

        self.rejectServer = function (serverId) {

            var connectToken = self.connectToken();

            if (!serverId) {
                throw new Error("null serverId");
            }
            if (!connectToken) {
                throw new Error("null connectToken");
            }
            if (!self.connectUserId()) {
                throw new Error("null connectUserId");
            }

            var url = "https://connect.emby.media/service/serverAuthorizations?serverId=" + serverId + "&userId=" + self.connectUserId();

            return fetch(url, {
                method: "DELETE",
                headers: {
                    "X-Connect-UserToken": connectToken,
                    "X-Application": appName + "/" + appVersion
                }
            });
        };

        self.acceptServer = function (serverId) {

            var connectToken = self.connectToken();

            if (!serverId) {
                throw new Error("null serverId");
            }
            if (!connectToken) {
                throw new Error("null connectToken");
            }
            if (!self.connectUserId()) {
                throw new Error("null connectUserId");
            }

            var url = "https://connect.emby.media/service/ServerAuthorizations/accept?serverId=" + serverId + "&userId=" + self.connectUserId();

            return ajax({
                type: "GET",
                url: url,
                headers: {
                    "X-Connect-UserToken": connectToken,
                    "X-Application": appName + "/" + appVersion
                }

            });
        };

        self.getRegistrationInfo = function (feature, apiClient) {

            return self.getAvailableServers().then(function (servers) {

                var matchedServers = servers.filter(function (s) {
                    return stringEqualsIgnoreCase(s.Id, apiClient.serverInfo().Id);
                });

                if (!matchedServers.length) {
                    return {};
                }

                var match = matchedServers[0];

                if (!match.DateLastLocalConnection) {

                    return ApiClient.getJSON(ApiClient.getUrl('System/Endpoint')).then(function (info) {

                        if (info.IsInNetwork) {

                            updateDateLastLocalConnection(match.Id);
                            return apiClient.getRegistrationInfo(feature);
                        } else {
                            return {};
                        }

                    });

                } else {
                    return apiClient.getRegistrationInfo(feature);
                }
            });
        };

        function updateDateLastLocalConnection(serverId) {

            var credentials = credentialProvider.credentials();
            var servers = credentials.Servers.filter(function (s) {
                return s.Id == serverId;
            });

            var server = servers.length ? servers[0] : null;

            if (server) {
                server.DateLastLocalConnection = new Date().getTime();
                credentialProvider.addOrUpdateServer(credentials.Servers, server);
                credentialProvider.credentials(credentials);
            }
        }

        return self;
    };

})(window, window.Logger);
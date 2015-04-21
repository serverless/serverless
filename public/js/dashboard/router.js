// Application Router
angular.module('appDashboard').config(['$stateProvider', '$urlRouterProvider',
    function($stateProvider, $urlRouterProvider) {
        // For any unmatched url, redirect to '/'
        $urlRouterProvider.otherwise('/');
        // Now set up the states
        $stateProvider
            .state('servants', {
                url: '/',
                templateUrl: 'views/dashboard/servants.html',
                resolve: {
                    initializeView: initializeView
                }
            })
            .state('menu', {
                url: '/:servantID/menu',
                templateUrl: 'views/dashboard/menu.html',
                resolve: {
                    initializeView: initializeView
                }
            })
    }
]);

// Resolves initializeView – Initialize The View
var initializeView = ['$q', '$rootScope', '$state', '$stateParams', 'Application', 'ServantAngularService',
    function($q, $rootScope, $state, $stateParams, Application, ServantAngularService) {
        // Defaults
        var deferView = $q.defer();

        if (!$rootScope.s.user || !$rootScope.s.servants.length) {

            $rootScope.s.loading = true;

            $rootScope.s.loadUserAndServants(function(error, response) {
                console.log("User and Servant Data Loaded: ", response);

                $rootScope.s.initializeServantSDK();

                // Set Servant, if included in params
                if ($stateParams.servantID) {
                    for (i = 0; i < response.servants.length; i++) {
                        if (response.servants[i]._id === $stateParams.servantID) $rootScope.s.servant_index = i;
                    }
                }

                $rootScope.s.loading = false;
                return deferView.resolve();
            });
            return deferView.promise;

        } else {
            // Set Servant, if included in params
            if ($stateParams.servantID) {
                for (i = 0; i < $rootScope.s.servants.length; i++) {
                    if ($rootScope.s.servants[i]._id === $stateParams.servantID) $rootScope.s.servant_index = i;
                }
            }

            $rootScope.s.loading = true;
            return true;
        }
    }
];


// Setting HTML5 Location Mode
angular.module('appDashboard').config(['$locationProvider',
    function($locationProvider) {
        $locationProvider.hashPrefix('!');
    }
]);
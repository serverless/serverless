// Application service used for application's REST endpoints
angular.module('appDashboard').factory('Application', function($resource) {
    return $resource('', null, {

        loadUserAndServants: {
            method: 'GET',
            isArray: false,
            url: '/user_and_servants'
        }


    });
});
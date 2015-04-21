/**
 *
 * This Angular Service Wraps the Servant Javascript SDK and returns promises
 * It's currently configured to work with v2 of the Servant Javascript SDK
 *
 */

angular.module('appDashboard').service('ServantAngularService', ['$rootScope', '$q', function($rootScope, $q) {

    this.status = function() {
        return Servant.status;
    }

    // Don't Intialize w/ Angular SDK

    this.getUserAndServants = function() {
        var def = $q.defer();
        Servant.getUserAndServants($rootScope.s.user.servant_access_token, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.showServant = function(servantID) {
        var def = $q.defer();
        Servant.showServant(servantID, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.setServant = function(servant) {
        var def = $q.defer();
        // Set Servant In SDK
        Servant.setServant(servant);
        def.resolve();
        return def.promise;
    }

    this.initializeUploadableArchetypes = function(options) {
        var def = $q.defer();
        Servant.initializeUploadableArchetypes(options);
        def.resolve();
        return def.promise;
    }

    this.instantiate = function(archetype) {
        var def = $q.defer();
        Servant.instantiate(archetype, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.validate = function(archetype, instance) {
        var def = $q.defer();
        Servant.validate(archetype, instance, function(errors, result) {
            if (errors) def.resolve(errors);
            if (result) def.resolve(result);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.saveArchetype = function(archetype, instance) {
        var def = $q.defer();
        Servant.saveArchetype(archetype, instance, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.showArchetype = function(archetype, archetypeID) {
        var def = $q.defer();
        Servant.showArchetype(archetype, archetypeID, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.queryArchetypes = function(archetype, criteria) {
        var def = $q.defer();
        Servant.queryArchetypes(archetype, criteria, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.deleteArchetype = function(archetype, archetypeID) {
        var def = $q.defer();
        Servant.deleteArchetype(archetype, archetypeID, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.archetypesRecent = function(archetype, page) {
        var def = $q.defer();
        Servant.archetypesRecent(archetype, page, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.archetypesOldest = function(archetype, page) {
        var def = $q.defer();
        Servant.archetypesOldest(archetype, page, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.servantpayCharge = function(amount, currency) {
        var def = $q.defer();
        Servant.servantpayCharge(amount, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.servantpaySubscriptionCreate = function(plan_id) {
        var def = $q.defer();
        Servant.servantpaySubscriptionCreate(plan_id, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.servantpaySubscriptionUpdate = function(plan_id) {
        var def = $q.defer();
        Servant.servantpaySubscriptionUpdate(plan_id, function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.servantpaySubscriptionCancel = function() {
        var def = $q.defer();
        Servant.servantpaySubscriptionCancel(function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

    this.servantpayCustomerDelete = function() {
        var def = $q.defer();
        Servant.servantpayCustomerDelete(function(response) {
            def.resolve(response);
        }, function(error) {
            def.reject(error);
        });
        return def.promise;
    }

}]);


// End
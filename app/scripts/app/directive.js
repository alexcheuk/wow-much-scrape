angular.module('Scrape')

.directive('selectOnClick', function () {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            element.on('click', function () {
                this.select();
            });
        }
    };
})

.directive('ngType', function ($timeout) {
    return {
        restrict: 'A',
        scope: {
        	ngType : '='
        },
        link: function (scope, element, attrs) {
            $(element).on('keyup', function(){
        		if(scope.searchTimer){
        		    $timeout.cancel(scope.searchTimer);
        		}  

        		scope.searchTimer = $timeout(function(){
        			scope.ngType();
        	    }, 200);
            });
        	   
            
        }
    };
})

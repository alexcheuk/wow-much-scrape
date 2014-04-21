angular.module('Scrape')

.filter('history_filter', function() {
  return function(items) {
    return items.slice().reverse();
  };
})

.filter('time_format', function() {
  return function(date) {
    return moment(date).format("hh:mm:ss A");
  }
})

.filter('money_format', function($sce) {
  return function(amt) {
    var formatted_gold = Common.formatMoney(amt);
    return $sce.trustAsHtml('<span class="icon-price icon-gold">' + formatted_gold.gold+'g</span> <span class="icon-price icon-silver">'+formatted_gold.silver+'s</span> <span class="icon-price icon-copper">'+formatted_gold.copper+'c</span>');
  }
})

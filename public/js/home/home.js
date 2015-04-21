/**
 * Home Script
 */

$(document).ready(function() {

	// When Connect button is clicked, say 'Connecting...'
    $('#connect-button').on('click', function() {
        var html = '<i class="fa fa-spinner fa-spin" style="margin-right:12px;margin-left:5px;opacity:0.6"></i>';
        html = html + ' Connecting...';
        $('#connect-button').html(html);
    });

});
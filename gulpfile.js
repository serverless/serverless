// Module Dependencies
var gulp = require('gulp'),
	gconcat = require('gulp-concat'),
	gzip = require('gulp-gzip'),
	jshint = require('gulp-jshint'),
	csslint = require('gulp-csslint'),
	ngmin = require('gulp-ngmin'),
	rename = require('gulp-rename'),
	uglify = require('gulp-uglify'),
	lr = require('tiny-lr'),
	spawn = require('child_process').spawn,
	lrServer = lr(),
	node;

// Location Arrays – (Note: The Order in Array is important as it reflects the order of loading...)
var serverjsLocations = ['./app/**/*.js', './config/env/*.js', './config/*.js', '*.js'],
	dashboardjsLocations = ['./public/js/dashboard/**/*.js'],
	homejsLocations = ['./public/js/home/**/*.js'],
	alljsLocations = serverjsLocations.concat(dashboardjsLocations, homejsLocations),
	cssLocations = ['./public/css/*.css'];

// Build Task
gulp.task('build', function() {
	gulp.src(dashboardjsLocations)
		.pipe(gconcat('dashboard.js'))
		.pipe(ngmin())
		.pipe(rename('dashboard.min.js'))
		.pipe(gulp.dest('./public/dist'))
		.pipe(uglify())
		.pipe(gulp.dest('public/dist'))
		.pipe(gzip())
		.pipe(gulp.dest('public/dist'));
	// .pipe(refresh(lrServer));
	gulp.src(homejsLocations)
		.pipe(gconcat('home.js'))
		.pipe(ngmin())
		.pipe(rename('home.min.js'))
		.pipe(gulp.dest('./public/dist'))
		.pipe(uglify())
		.pipe(gulp.dest('public/dist'))
		.pipe(gzip())
		.pipe(gulp.dest('public/dist'));
	// .pipe(refresh(lrServer));
});

// Server Task
gulp.task('server', function() {
	if (node) node.kill();
	node = spawn('node', ['server.js'], {
		stdio: 'inherit'
	});
	node.on('close', function(code) {
		if (code === 8) console.log('Error detected, waiting for changes...');
		lrServer.close();
	});
});

// Watch Statements
gulp.task('default', ['build', 'server'], function() {

	gulp.watch(alljsLocations, ['server'], function() {});

	lrServer.listen(35731, function(err) {
		if (err) return console.log(err);
	});

});
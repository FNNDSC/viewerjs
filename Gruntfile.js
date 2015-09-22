/*global module:false*/
module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({

    // Metadata.
    pkg: grunt.file.readJSON('package.json'),
    banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
      '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
      '<%= pkg.homepage ? "* " + pkg.homepage + "\\n" : "" %>' +
      '* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>;' +
      ' Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %> */\n',

    // Custome Paths
    srcFiles: ['src/js/*.js'], // source files
    testFiles: ['spec/*.spec.js'], // test files (jasmine specs)
    libDir: 'src/js/lib', // libraries that cannot be installed through bower
    componentsDir: 'src/js/components', // bower components

    // Task configuration.
    watch: {
        files: ['src/**/*.js','src/**/*.css', 'src/**/*.html'],
        tasks: ['jshint:source', 'jasmine:test']
    },
    browserSync: {
        dev: {
            bsFiles: {
                src : [
                    'src/**/*.js',
                    'src/**/*.css',
                    'src/**/*.html'
                ]
            },
            options: {
                watchTask: true,
                // test to move bower_components out...
                // bower_components not used yet...
                server: ['src', 'bower_components']
            }
        }
    },
    jshint: {
      options: {
        curly: true,
        eqeqeq: true,
        immed: true,
        latedef: true,
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        unused: true,
        boss: true,
        eqnull: true,
        browser: true,
        globals: {
          jQuery: true, $: true, viewerjs: true, X: true, dicomParser: true, console: true,
          alert: true, require: true, describe: true, it: true, expect: true, define: true
        }
      },
      source: {
        src: '<%= srcFiles %>'
      },
      gruntfile: {
        src: 'Gruntfile.js'
      },
      test: {
        src: '<%= testFiles %>'
      }
    },

    jasmine: {
      test: {
        //src: '<%= jshint.source.src %>', this line must be commented when using the define function within the specs files
        options: {
          specs: '<%= jshint.test.src %>',
          template: require('grunt-template-jasmine-requirejs'),
          templateOptions: {
            version: '<%= componentsDir %>/requirejs/require.js',
            requireConfigFile: 'src/main.js', // requireJS's config file
            requireConfig: {
              baseUrl: '<%= componentsDir %>' // change base url to execute tests from local FS
            }
          }
        }
      }
    },

    requirejs: {
      compile: {
        options: {
          baseUrl: '<%= componentsDir %>',
          paths: {
            jquery: 'empty:', // does not include jquery in the output
            jquery_ui: 'empty:' // does not include jquery_ui in the output
          },
          name: 'viewerjs',
          mainConfigFile: 'src/main.js',
          out: 'dist/js/<%= pkg.name %>.min.js'
        }
      }
    },

    copy: {
      styles: {
        files: [{expand: true, cwd: 'src/', src: ['styles/**'], dest: 'dist/'}]
      },
      components: { // copy requiered bower components which were not concatenated
        files: [
          { expand: true,
            cwd: '<%= componentsDir %>',
            src: ['requirejs/require.js', 'jquery/dist/jquery.min.js',
              'jquery-ui/jquery-ui.min.js', 'jquery-ui/themes/smoothness/**'],
            dest: 'dist/js/components' }]
      },
    }
    // ,

    // watch: {
    //   source: {
    //     files: '<%= jshint.source.src %>',
    //     tasks: ['jshint:source']
    //   },
    //   gruntfile: {
    //     files: '<%= jshint.gruntfile.src %>',
    //     tasks: ['jshint:gruntfile']
    //   },
    //   test: {
    //     files: '<%= jshint.test.src %>',
    //     tasks: ['jshint:test', 'jasmine']
    //   }
    // }

  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-jasmine');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-browser-sync');
  grunt.loadNpmTasks('grunt-contrib-requirejs');

  // Serve task.
  grunt.registerTask('serve', function (/*target*/) {
    // grunt server:dist not implemented yet...

    // if (target === 'dist') {
    //   return grunt.task.run(['build', 'browserSync:dist',
    //   'watch']);
    // }

    grunt.task.run([
      'browserSync:dev',
      'watch'
    ]);
  });

  // Test task.
  grunt.registerTask('test', ['jshint', 'jasmine']);
  // Build task.
  grunt.registerTask('build', ['jshint', 'jasmine', 'requirejs', 'copy']);
  // Default task.
  grunt.registerTask('default', ['build']);

};

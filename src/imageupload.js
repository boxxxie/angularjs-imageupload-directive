(function(){
  "use strict";
  angular.module("imageupload", [])
    .factory("getResizeArea", function(){
      return function () {
        var resizeAreaId = "fileupload-resize-area";

        var resizeArea = document.getElementById(resizeAreaId);

        if (!resizeArea) {
          resizeArea = document.createElement("canvas");
          resizeArea.id = resizeAreaId;
          resizeArea.style.display = "none";
          document.body.appendChild(resizeArea);
        }
        return resizeArea;
      };
    })
    .factory("resizeImage", ['getResizeArea', function(getResizeArea){
      return function (origImage, options) {
        var maxHeight = options.resizeMaxHeight || 300;
        var maxWidth = options.resizeMaxWidth || 250;
        var quality = options.resizeQuality || 0.7;
        var cover = options.cover || options.cover === "" || false;
        var coverHeight = options.coverHeight || 300;
        var coverWidth = options.coverWidth || 250;
        var coverX = options.coverX || "left";
        var coverY = options.coverY || "top";
        var type = options.resizeType || "image/jpg";

        var canvas = getResizeArea();

        var height = origImage.height;
        var width = origImage.width;

        var imgX = 0;
        var imgY = 0;

        if(!cover){
          // calculate the width and height, constraining the proportions
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round(height *= maxWidth / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round(width *= maxHeight / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

        }else{
          // Logic for calculating size when in cover-mode
          canvas.width = coverHeight;
          canvas.height = coverWidth;
          // Resize image to fit canvas and keep original proportions
          var ratio = 1;
          if(height < canvas.height)
          {
            ratio = canvas.height / height;
            height = height * ratio;
            width = width * ratio;
          }
          if(width < canvas.width)
          {
            ratio = canvas.width / width;
            height = height * ratio;
            width = width * ratio;
          }

          // Check if both are too big -> downsize
          if(width > canvas.width && height > canvas.height)
          {
            ratio = Math.max(canvas.width/width, canvas.height/height);
            height = height * ratio;
            width = width * ratio;
          }

          // place img according to coverX and coverY values
          if(width > canvas.width){
            if(coverX === "right"){ imgX = canvas.width - width; }
            else if (coverX === "center"){ imgX = (canvas.width - width) / 2; }
          }else if(height > canvas.height){
            if(coverY === "bottom"){ imgY = canvas.height - height; }
            else if (coverY === "center"){ imgY = (canvas.height - height) / 2; }
          }

        }

        //draw image on canvas
        var ctx = canvas.getContext("2d");
        ctx.drawImage(origImage, imgX, imgY, width, height);

        // get the data from canvas as 70% jpg (or specified type).
        return canvas.toDataURL(type, quality);
      };
    }])
    .factory("fileToDataURL", ['$q',function($q) {
      return function (file) {
        var deferred = $q.defer();
        var reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = function (e) {
          deferred.resolve(e.target.result);
        };
        reader.onerror = function(e){
          deferred.reject(e);
        };
        reader.onabort = function(e){
          deferred.reject(e);
        };

        return deferred.promise;
      };
    }])
    .factory("createImage",['$q',function($q){
      return function(url) {
        var deferred = $q.defer();
        var image = new Image();
        image.src = url;
        image.onload = function() {
          deferred.resolve(image);
        };
        image.onerror = function(e){
          deferred.reject(e);
        };
        return deferred.promise;
      };
    }])
    .factory("map", function(){
      return function(list, fn){
        return Array.prototype.map.call(list, fn);
      };
    })
    .factory("appendDataUri",  ['fileToDataURL','map','$q',function(fileToDataURL, map, $q) {

      function appendDataUri(model){
        return fileToDataURL(model.file)
          .then(function (dataURL) {
            model.dataURL = dataURL;
            return model;
          });
      }

      return function(model) {
        // If the viewValue is invalid (say required but empty) it will be `undefined`
        if (angular.isUndefined(model)){
          return;
        }

        if(angular.isArray(model)){
          var model_update_promises = map(model, appendDataUri);
          return $q.all(model_update_promises);
        }
        else{
          return appendDataUri(model);
        }
      };
    }])
    .factory("create_model_from_files", ['map',function(map){
      return function(files){
        var model = map(files, function(imageFile){
          var file_obj = {
            file: imageFile
          };
          return file_obj;
        });
        return model;
      };
    }])
    .factory("add_data_uris", ['map', 'appendDataUri', '$q', function(map, appendDataUri, $q){
      return function(options){
        var should_append_data_uris = angular.isDefined(options.appendDataUri);
        return function(model){
          if(should_append_data_uris){
            return $q.all(map(model, appendDataUri));
          }
          else{
            return model;
          }
        };
      };
    }])
    .factory("doResizing", ['$q','createImage','resizeImage', function($q, createImage, resizeImage){
      return function(options){
        return function(model) {
          model.url = URL.createObjectURL(model.file); //this is used to generate images/resize
          return createImage(model.url)
            .then(function(image) {
              var dataURL = resizeImage(image, options);
              var imageType = dataURL.substring(5, dataURL.indexOf(";"));
              model.resized = {
                dataURL: dataURL,
                type: imageType
              };
              return model;
            });
        };
      };
    }])
    .factory("resize", ['$q','doResizing','map', function($q, doResizing, map){
      return function(options){
        var should_do_resizing = angular.isDefined(options.resize) &&
          angular.isDefined(options.resizeMaxHeight) &&
          angular.isDefined(options.resizeMaxWidth);

        return function(model){
          if(should_do_resizing){
            return $q.all(map(model, doResizing(options)));
          }
          else{
            return model;
          }
        };
      };
    }])
    .factory("generic_image_processing_functions", ['$q', 'create_model_from_files', 'add_data_uris', 'resize', function($q, create_model_from_files, add_data_uris, resize){
      return function(files, options){
        return $q.when(create_model_from_files(files))
          .then(add_data_uris(options))
          .then(resize(options));
      };
    }])

    .factory("multi_image_model_updater", function(){
      return function update_model(ngModel, options){
        return function(model){
          var old_model = ngModel.$modelValue;
          var model_to_update;
          if(angular.isDefined(options.append) && angular.isArray(old_model)){
            model_to_update = old_model.concat(model);
          }
          else{
            model_to_update = model;
          }
          ngModel.$setViewValue(model_to_update);

        };
      };
    })
    .directive("inputImages",  ['generic_image_processing_functions', 'multi_image_model_updater', function(generic_image_processing_functions,
                                 multi_image_model_updater) {

      return {
        require: "ngModel",
        link: function (scope, element, attrs, ngModel) {

          var file_upload_element = new angular.element("<input type='file' accept='image/*' multiple>");

          element.on("click", function(){
            file_upload_element[0].click();
          });

          file_upload_element.bind("change", function (evt) {
            var files = evt.target.files;

            generic_image_processing_functions(files, attrs)
              .then(multi_image_model_updater(ngModel, attrs));
          });
        }
      };
    }])
    .directive("inputImage",  ['generic_image_processing_functions', function(generic_image_processing_functions) {
      return {
        require: "ngModel",
        link: function (scope, element, attrs, ngModel) {

          var file_upload_element = new angular.element("<input type='file' accept='image/*'>");

          element.on("click", function(){
            file_upload_element[0].click();
          });

          file_upload_element.bind("change", function (evt) {
            var files = evt.target.files;

            generic_image_processing_functions(files, attrs)
              .then(update_model);
          });

          function update_model(model){
            ngModel.$setViewValue(model[0]);
          }


        }
      };
    }])
    .factory("image_drop_linker_common", ['$document','$log', function($document, $log){
      return function (scope, element, attrs) {

        var decoration = attrs.decoration || "drag-over";

        function decorate_dragged_element(element){
          element.addClass(decoration);
        }
        function undecorate_dragged_element(element){
          element.removeClass(decoration);
        }

        //When an item is dragged over the document, add .dragOver to the body
        function onDragOver(e) {
          e.preventDefault();
          decorate_dragged_element(element);
        }

        //When the user leaves the window, cancels the drag or drops the item
        function onDragLeave(e) {
          e.preventDefault();
          undecorate_dragged_element(element);
        }

        function onDragOverDoc(e){
          e.preventDefault();
        }
        function onDragLeaveDoc(e){
          e.preventDefault();
        }
        function onDropDoc(e){
          e.preventDefault();
        }

        $document.bind("dragover", onDragOverDoc);
        $document.bind("dragleave", onDragLeaveDoc);
        $document.bind("drop", onDropDoc);

        //Dragging begins on the document (shows the overlay)
        element.bind("dragover", onDragOver);

        //Dragging ends on the overlay, which takes the whole window
        element.bind("dragleave", onDragLeave);

        element.bind("drop", function (e) {
          e.preventDefault();
          $log.debug("drop", e);
          undecorate_dragged_element(element);
        });
      };
    }])
    .factory("find_data_transfer", function(){
      return function (e){
        if(e.dataTransfer){
          return e.dataTransfer;
        }
        if(e.originalEvent && e.originalEvent.dataTransfer){
          return e.originalEvent.dataTransfer;
        }
        return undefined;
      };
    })
    .directive("imageDrop", ['find_data_transfer','image_drop_linker_common','generic_image_processing_functions', function (
      find_data_transfer,
      image_drop_linker_common,
      generic_image_processing_functions){
      return {
        restrict: "EA",
        require: "ngModel",
        link: function(scope, element, attrs, ngModel){
          image_drop_linker_common(scope, element, attrs, ngModel);

          function update_model(model){
            ngModel.$setViewValue(model[0]);
          }

          element.bind("drop", function (e) {
            var files = find_data_transfer(e).files;

            generic_image_processing_functions(files, attrs)
              .then(update_model);
          });
        }
      };
    }])
    .directive("imagesDrop", ['find_data_transfer','image_drop_linker_common','generic_image_processing_functions','multi_image_model_updater', function (
      find_data_transfer,
      image_drop_linker_common,
      generic_image_processing_functions,
      multi_image_model_updater){
      return {
        restrict: "EA",
        require: "ngModel",
        link: function (scope, element, attrs, ngModel) {

          image_drop_linker_common(scope, element, attrs, ngModel);

          element.bind("drop", function (e) {
            var files = find_data_transfer(e).files;

            generic_image_processing_functions(files, attrs)
              .then(multi_image_model_updater(ngModel, attrs));
          });
        }
      };
    }]);
})();

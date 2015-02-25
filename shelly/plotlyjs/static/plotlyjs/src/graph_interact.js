(function(root, factory){
    if (typeof exports == 'object') {
        // CommonJS
        module.exports = factory(root, require('./plotly'));
    } else {
        // Browser globals
        if (!root.Plotly) { root.Plotly = {}; }
        factory(root, root.Plotly);
    }
}(this, function(exports, Plotly){
    // `exports` is `window`
    // `Plotly` is `window.Plotly`

    'use strict';
    /* jshint camelcase: false */

    // ---external global dependencies
    /* global d3:false, tinycolor:false */

    var fx = Plotly.Fx = {};

    fx.layoutAttributes = {
        dragmode: {
            type: 'enumerated',
            values: ['zoom', 'pan'],
            dflt: 'zoom'
        },
        hovermode: {
            type: 'enumerated',
            values: ['x', 'y', 'closest', false]
        }
    };

    fx.supplyLayoutDefaults = function(layoutIn, layoutOut, fullData) {
        function coerce(attr, dflt) {
            return Plotly.Lib.coerce(layoutIn, layoutOut,
                                     fx.layoutAttributes,
                                     attr, dflt);
        }

        coerce('dragmode');

        if (layoutOut._hasGL3D) {
            coerce('hovermode', 'closest');
        } else {
            if (layoutOut._isHoriz===undefined) layoutOut._isHoriz = fx.isHoriz(fullData);
            coerce('hovermode', layoutOut._isHoriz ? 'y' : 'x');
        }
    };

    // returns true if ALL traces have orientation 'h' (for 'hovermode')
    fx.isHoriz = function isHoriz(fullData) {
        return fullData.every(function(trace) {
            return trace.orientation==='h';
        });
    };

    // ms between first mousedown and 2nd mouseup to constitute dblclick...
    // we don't seem to have access to the system setting
    fx.DBLCLICKDELAY = 600;

    // pixels to move mouse before you stop clamping to starting point
    fx.MINDRAG = 8;

    // smallest dimension allowed for a zoombox
    fx.MINZOOM = 20;

    // width of axis drag regions
    var DRAGGERSIZE = 20;

    fx.init = function(gd) {
        var fullLayout = gd._fullLayout,
            fullData = gd._fullData;

        if (fullLayout._isHoriz===undefined) fullLayout._isHoriz = fx.isHoriz(fullData);

        if (fullLayout._hasGL3D || gd._context.staticPlot) return;

        var subplots = Object.keys(fullLayout._plots).sort(function(a,b) {
            // sort overlays last, then by x axis number, then y axis number
            if( (fullLayout._plots[a].mainplot && true) ===
                    (fullLayout._plots[b].mainplot && true) ) {
                var aParts = a.split('y'),
                    bParts = b.split('y');
                return (aParts[0]===bParts[0]) ?
                    (Number(aParts[1]||1) - Number(bParts[1]||1)) :
                    (Number(aParts[0]||1) - Number(bParts[0]||1));
            }
            return fullLayout._plots[a].mainplot ? 1 : -1;
        });
        subplots.forEach(function(subplot) {
            var plotinfo = fullLayout._plots[subplot],
                xa = plotinfo.x(),
                ya = plotinfo.y(),

                // the y position of the main x axis line
                y0 = (xa._linepositions[subplot]||[])[3],

                // the x position of the main y axis line
                x0 = (ya._linepositions[subplot]||[])[3];

            if($.isNumeric(y0) && xa.side==='top') y0 -= DRAGGERSIZE;
            if($.isNumeric(x0) && ya.side!=='right') x0 -= DRAGGERSIZE;

            // main and corner draggers need not be repeated for
            // overlaid subplots - these draggers drag them all
            if(!plotinfo.mainplot) {
                // main dragger goes over the grids and data, so we use its
                // mousemove events for all data hover effects
                var maindrag = dragBox(gd, plotinfo, 0, 0,
                    xa._length, ya._length,'ns','ew');
                $(maindrag)
                    .mousemove(function(evt){
                        fx.hover(gd,evt,subplot);
                        fullLayout._lasthover = maindrag;
                        fullLayout._hoversubplot = subplot;
                    })
                    .mouseout(function(evt){
                        fx.unhover(gd,evt);
                    })
                    .click(function(evt){ fx.click(gd,evt); });
                // corner draggers
                dragBox(gd, plotinfo, -DRAGGERSIZE, -DRAGGERSIZE,
                    DRAGGERSIZE, DRAGGERSIZE, 'n', 'w');
                dragBox(gd, plotinfo, xa._length,   -DRAGGERSIZE,
                    DRAGGERSIZE, DRAGGERSIZE, 'n', 'e');
                dragBox(gd, plotinfo, -DRAGGERSIZE, ya._length,
                    DRAGGERSIZE, DRAGGERSIZE, 's', 'w');
                dragBox(gd, plotinfo, xa._length,   ya._length,
                    DRAGGERSIZE, DRAGGERSIZE, 's', 'e');
            }

            // x axis draggers - if you have overlaid plots,
            // these drag each axis separately
            if($.isNumeric(y0)) {
                if(xa.anchor==='free') y0 -= fullLayout._size.h*(1-ya.domain[1]);
                dragBox(gd, plotinfo, xa._length*0.1, y0,
                    xa._length*0.8, DRAGGERSIZE, '', 'ew');
                dragBox(gd, plotinfo, 0, y0,
                    xa._length*0.1, DRAGGERSIZE, '', 'w');
                dragBox(gd, plotinfo, xa._length*0.9, y0,
                    xa._length*0.1, DRAGGERSIZE, '', 'e');
            }
            // y axis draggers
            if($.isNumeric(x0)) {
                if(ya.anchor==='free') x0 -= fullLayout._size.w*xa.domain[0];
                dragBox(gd, plotinfo, x0, ya._length*0.1,
                    DRAGGERSIZE, ya._length*0.8, 'ns', '');
                dragBox(gd, plotinfo, x0, ya._length*0.9,
                    DRAGGERSIZE, ya._length*0.1, 's', '');
                dragBox(gd, plotinfo, x0, 0,
                    DRAGGERSIZE, ya._length*0.1, 'n', '');
            }
        });

        // in case you mousemove over some hovertext, send it to fx.hover too
        // we do this so that we can put the hover text in front of everything,
        // but still be able to interact with everything as if it isn't there
        $(fullLayout._hoverlayer.node())
            .off('mousemove click')
            .on('mousemove',function(evt){
                evt.target = fullLayout._lasthover;
                fx.hover(gd,evt,fullLayout._hoversubplot);
            })
            .on('click',function(evt){
                evt.target = fullLayout._lasthover;
                fx.click(gd,evt);
            });
        // also delegate mousedowns... TODO: does this actually work?
        fullLayout._hoverlayer.node().onmousedown = function(evt){
            fullLayout._lasthover.onmousedown(evt);
        };
    };

    // hover labels for multiple horizontal bars get tilted by some angle,
    // then need to be offset differently if they overlap
    var YANGLE = 60,
        YA_RADIANS = Math.PI*YANGLE/180,

        // expansion of projected height
        YFACTOR = 1/Math.sin(YA_RADIANS),

        // to make the appropriate post-rotation x offset,
        // you need both x and y offsets
        YSHIFTX = Math.cos(YA_RADIANS),
        YSHIFTY = Math.sin(YA_RADIANS);

    // convenience functions for mapping all relevant axes
    function flat(subplots, v) {
        var out = [];
        for(var i=subplots.length; i>0; i--) out.push(v);
        return out;
    }

    function p2c(axArray, v) {
        var out = [];
        for(var i=0; i<axArray.length; i++) out.push(axArray[i].p2c(v));
        return out;
    }

    function quadrature(dx, dy) {
        return function(di){
            var x = dx(di),
                y = dy(di);
            return Math.sqrt(x*x + y*y);
        };
    }

    // size and display constants for hover text
    var HOVERARROWSIZE = 6, // pixel size of hover arrows
        HOVERTEXTPAD = 3, // pixels padding around text
        HOVERFONTSIZE = 13,
        HOVERFONT = 'Arial, sans-serif';

    // max pixels away from mouse to allow a point to highlight
    fx.MAXDIST = 20;

    // fx.hover: highlight data on hover
    // evt can be a mousemove event, or an object with data about what points
    //   to hover on
    //      {xpx,ypx[,hovermode]} - pixel locations from top left
    //          (with optional overriding hovermode)
    //      {xval,yval[,hovermode]} - data values
    //      [{curveNumber,(pointNumber|xval and/or yval)}] -
    //              array of specific points to highlight
    //          pointNumber is a single integer if gd.data[curveNumber] is 1D,
    //              or a two-element array if it's 2D
    //          xval and yval are data values,
    //              1D data may specify either or both,
    //              2D data must specify both
    // subplot is an id string (default "xy")
    // makes use of gl.hovermode, which can be:
    //      x (find the points with the closest x values, ie a column),
    //      closest (find the single closest point)
    //    internally there are two more that occasionally get used:
    //      y (pick out a row - only used for multiple horizontal bar charts)
    //      array (used when the user specifies an explicit
    //          array of points to hover on)
    //
    // We wrap the hovers in a timer, to limit their frequency.
    // The actual rendering is done by private functions
    // hover() and unhover().

    var HOVERMINTIME = 100; // minimum time between hover calls

    fx.hover = function (gd, evt, subplot) {
        if(gd._lastHoverTime === undefined) gd._lastHoverTime = 0;

        // If we have an update queued, discard it now
        if (gd._hoverTimer !== undefined) {
            clearTimeout(gd._hoverTimer);
            gd._hoverTimer = undefined;
        }
        // Is it more than 100ms since the last update?  If so, force
        // an update now (synchronously) and exit
        if (Date.now() > gd._lastHoverTime + HOVERMINTIME) {
            hover(gd,evt,subplot);
            gd._lastHoverTime = Date.now();
            return;
        }
        // Queue up the next hover for 100ms from now (if no further events)
        gd._hoverTimer = setTimeout(function () {
            hover(gd,evt,subplot);
            gd._lastHoverTime = Date.now();
            gd._hoverTimer = undefined;
        }, HOVERMINTIME);
    };

    fx.unhover = function (gd, evt, subplot) {
        // Important, clear any queued hovers
        if (gd._hoverTimer) {
            clearTimeout(gd._hoverTimer);
            gd._hoverTimer = undefined;
        }
        unhover(gd,evt,subplot);
    };

    // The actual implementation is here:

    function hover(gd, evt, subplot){
        if(typeof gd === 'string') gd = document.getElementById(gd);
        if(!subplot) subplot = 'xy';

        var fullLayout = gd._fullLayout,
            plotinfo = fullLayout._plots[subplot],
            // list of all overlaid subplots to look at
            subplots = [subplot].concat(plotinfo.overlays
                .map(function(pi){ return pi.id; })),
            xaArray = subplots.map(function(spId) {
                return Plotly.Axes.getFromId(gd, spId, 'x');
            }),
            yaArray = subplots.map(function(spId) {
                return Plotly.Axes.getFromId(gd, spId, 'y');
            }),
            hovermode = evt.hovermode || fullLayout.hovermode;

        if(['x','y','closest'].indexOf(hovermode)===-1 || !gd.calcdata ||
                $(gd).find('.zoombox').length || gd._dragging) {
            return unhover(gd, evt);
        }

            // hoverData: the set of candidate points we've found to highlight
        var hoverData = [],

            // searchData: the data to search in. Mostly this is just a copy of
            // gd.calcdata, filtered to the subplot and overlays we're on
            // but if a point array is supplied it will be a mapping
            // of indicated curves
            searchData = [],

            // [x|y]valArray: the axis values of the hover event
            // mapped onto each of the currently selected overlaid subplots
            xvalArray,
            yvalArray,

            // used in loops
            itemnum,
            curvenum,
            cd,
            trace,
            subploti,
            mode,
            xval,
            yval,
            pointData,
            closedataPreviousLength;

        // Figure out what we're hovering on:
        // mouse location or user-supplied data

        if($.isArray(evt)){
            // user specified an array of points to highlight
            hovermode = 'array';
            for(itemnum = 0; itemnum<evt.length; itemnum++) {
                cd = gd.calcdata[evt[itemnum].curveNumber||0];
                if(cd[0].trace.hoverinfo!=='none') searchData.push(cd);
            }
        }
        else {
            for(curvenum = 0; curvenum<gd.calcdata.length; curvenum++) {
                cd = gd.calcdata[curvenum];
                trace = cd[0].trace;
                if(trace.hoverinfo!=='none' && subplots.indexOf(trace.xaxis + trace.yaxis)!==-1) {
                    searchData.push(cd);
                }
            }

            // [x|y]px: the pixels (from top left) of the mouse location
            // on the currently selected plot area
            var xpx, ypx;

            // mouse event? ie is there a target element with
            // clientX and clientY values?
            if(evt.target && ('clientX' in evt) && ('clientY' in evt)) {

                // fire the beforehover event and quit if it returns false
                // note that we're only calling this on real mouse events, so
                // manual calls to fx.hover will always run.
                if($(gd).triggerHandler('plotly_beforehover',evt)===false) {
                    return;
                }

                var dbb = evt.target.getBoundingClientRect();

                xpx = evt.clientX - dbb.left;
                ypx = evt.clientY - dbb.top;

                // in case hover was called from mouseout into hovertext,
                // it's possible you're not actually over the plot anymore
                if(xpx<0 || xpx>dbb.width || ypx<0 || ypx>dbb.height) {
                    return unhover(gd,evt);
                }
            }
            else {
                if('xpx' in evt) xpx = evt.xpx;
                else xpx = xaArray[0]._length/2;

                if('ypx' in evt) ypx = evt.ypx;
                else ypx = yaArray[0]._length/2;
            }

            if('xval' in evt) xvalArray = flat(subplots, evt.xval);
            else xvalArray = p2c(xaArray, xpx);

            if('yval' in evt) yvalArray = flat(subplots, evt.yval);
            else yvalArray = p2c(yaArray, ypx);

            if(!$.isNumeric(xvalArray[0]) || !$.isNumeric(yvalArray[0])) {
                console.log('Plotly.Fx.hover failed', evt, gd);
                return unhover(gd, evt);
            }
        }

        // the pixel distance to beat as a matching point
        // in 'x' or 'y' mode this resets for each trace
        var distance = Infinity;

        // find the closest point in each trace
        // this is minimum dx and/or dy, depending on mode
        // and the pixel position for the label (labelXpx, labelYpx)
        for(curvenum = 0; curvenum<searchData.length; curvenum++) {
            cd = searchData[curvenum];

            // filter out invisible or broken data
            if(!cd || !cd[0] || !cd[0].trace || cd[0].trace.visible !== true) continue;

            trace = cd[0].trace;
            subploti = subplots.indexOf(trace.xaxis + trace.yaxis);

            // within one trace mode can sometimes be overridden
            mode = hovermode;

            // container for new point, also used to pass info into module.hoverPoints
            pointData = {
                // trace properties
                cd: cd,
                trace: trace,
                xa: xaArray[subploti],
                ya: yaArray[subploti],
                name: gd.data.length>1 ? trace.name : undefined,
                // point properties - override all of these
                index: false, // point index in trace - only used by plotly.js hoverdata consumers
                distance: Math.min(distance, fx.MAXDIST), // pixel distance or pseudo-distance
                color: '#444', // trace color
                x0: undefined,
                x1: undefined,
                y0: undefined,
                y1: undefined,
                xLabelVal: undefined,
                yLabelVal: undefined,
                zLabelVal: undefined,
                text: undefined
            };

            closedataPreviousLength = hoverData.length;

            // for a highlighting array, figure out what
            // we're searching for with this element
            if(mode==='array') {
                var selection = evt[curvenum];
                if('pointNumber' in selection) {
                    pointData.index = selection.pointNumber;
                    mode = 'closest';
                }
                else {
                    mode = '';
                    if('xval' in selection) {
                        xval = selection.xval;
                        mode = 'x';
                    }
                    if('yval' in selection) {
                        yval = selection.yval;
                        mode = mode ? 'closest' : 'y';
                    }
                }
            }
            else {
                xval = xvalArray[subploti];
                yval = yvalArray[subploti];
            }

            // Now find the points.
            if(trace._module && trace._module.hoverPoints) {
                var newPoints = trace._module.hoverPoints(pointData, xval, yval, mode);
                if(newPoints) {
                    var newPoint;
                    for(var newPointNum=0; newPointNum<newPoints.length; newPointNum++) {
                        newPoint = newPoints[newPointNum];
                        if($.isNumeric(newPoint.x0) && $.isNumeric(newPoint.y0)) {
                            hoverData.push(cleanPoint(newPoint, hovermode));
                        }
                    }
                }
            }
            else {
                console.log('unrecognized trace type in hover', trace);
            }

            // in closest mode, remove any existing (farther) points
            // and don't look any farther than this latest point (or points, if boxes)
            if(hovermode==='closest' && hoverData.length > closedataPreviousLength) {
                hoverData.splice(0, closedataPreviousLength);
                distance = hoverData[0].distance;
            }

        }

        // nothing left: remove all labels and quit
        if(hoverData.length===0) return unhover(gd,evt);

        // if there's more than one horz bar trace,
        // rotate the labels so they don't overlap
        var rotateLabels = hovermode==='y' && searchData.length>1;

        hoverData.sort(function(d1, d2) { return d1.distance - d2.distance; });

        var labelOpts = {
            hovermode: hovermode,
            rotateLabels: rotateLabels,
            bgColor: combineColors(fullLayout.plot_bgcolor, fullLayout.paper_bgcolor),
            container: fullLayout._hoverlayer,
            outerContainer: fullLayout._paperdiv
        };
        var hoverLabels = createHoverText(hoverData, labelOpts);

        hoverAvoidOverlaps(hoverData, rotateLabels ? xaArray[0] : yaArray[0]);

        alignHoverText(hoverLabels, rotateLabels);

        // lastly, trigger custom hover/unhover events
        var oldhoverdata = gd._hoverdata,
            newhoverdata = [];

        // pull out just the data that's useful to
        // other people and send it to the event
        for(itemnum = 0; itemnum<hoverData.length; itemnum++) {
            var pt = hoverData[itemnum];
            var out = {
                data: pt.trace._input,
                fullData: pt.trace,
                curveNumber: pt.trace.index,
                pointNumber: pt.index,
                x: pt.xVal,
                y: pt.yVal,
                xaxis: pt.xa,
                yaxis: pt.ya
            };
            if(pt.zLabelVal!==undefined) out.z = pt.zLabelVal;
            newhoverdata.push(out);
        }
        gd._hoverdata = newhoverdata;

        if(!hoverChanged(gd, evt, oldhoverdata)) return;

        // trigger the custom hover handler. Bind this like:
        // $(gd).on('hover.plotly',
        //    function(event,extras){ do something with extras.data });
        if(oldhoverdata) {
            $(gd).trigger('plotly_unhover', {points: oldhoverdata});
        }
        $(gd).trigger('plotly_hover', {
            points: gd._hoverdata,
            xaxes: xaArray,
            yaxes: yaArray,
            xvals: xvalArray,
            yvals: yvalArray
        });
    }

    fx.getDistanceFunction = function(mode, dx, dy, dxy) {
        if(mode==='closest') return dxy || quadrature(dx, dy);
        return mode==='x' ? dx : dy;
    };

    fx.getClosest = function(cd, distfn, pointData) {
        // do we already have a point number? (array mode only)
        if(pointData.index!==false) {
            if(pointData.index>=0 && pointData.index<cd.length) {
                pointData.distance = 0;
            }
            else pointData.index = false;
        }
        else {
            // apply the distance function to each data point
            // this is the longest loop... if this bogs down, we may need
            // to create pre-sorted data (by x or y), not sure how to
            // do this for 'closest'
            for(var i=0; i<cd.length; i++) {
                var newDistance = distfn(cd[i]);
                if(newDistance < pointData.distance) {
                    pointData.index = i;
                    pointData.distance = newDistance;
                }
            }
        }
        return pointData;
    };

    function cleanPoint(d, hovermode) {
        d.posref = hovermode==='y' ? (d.x0+d.x1)/2 : (d.y0+d.y1)/2;

        // then constrain all the positions to be on the plot
        d.x0 = Plotly.Lib.constrain(d.x0, 0, d.xa._length);
        d.x1 = Plotly.Lib.constrain(d.x1, 0, d.xa._length);
        d.y0 = Plotly.Lib.constrain(d.y0, 0, d.ya._length);
        d.y1 = Plotly.Lib.constrain(d.y1, 0, d.ya._length);

        // and convert the x and y label values into objects
        // formatted as text, with font info
        var logOffScale;
        if(d.xLabelVal!==undefined) {
            logOffScale = (d.xa.type==='log' && d.xLabelVal<=0);
            var xLabelObj = Plotly.Axes.tickText(d.xa,
                    d.xa.c2l(logOffScale ? -d.xLabelVal : d.xLabelVal), 'hover');
            if(logOffScale) {
                if(d.xLabelVal===0) d.xLabel = '0';
                else d.xLabel = '-' + xLabelObj.text;
            }
            else d.xLabel = xLabelObj.text;
            d.xVal = d.xa.c2d(d.xLabelVal);
        }

        if(d.yLabelVal!==undefined) {
            logOffScale = (d.ya.type==='log' && d.yLabelVal<=0);
            var yLabelObj = Plotly.Axes.tickText(d.ya,
                    d.ya.c2l(logOffScale ? -d.yLabelVal : d.yLabelVal), 'hover');
            if(logOffScale) {
                if(d.yLabelVal===0) d.yLabel = '0';
                else d.yLabel = '-' + yLabelObj.text;
            }
            else d.yLabel = yLabelObj.text;
            d.yVal = d.ya.c2d(d.yLabelVal);
        }

        if(d.zLabelVal!==undefined) d.zLabel = String(d.zLabelVal);

        // for box means and error bars, add the range to the label
        if(d.xerr!==undefined) {
            var xeText = Plotly.Axes.tickText(d.xa, d.xa.c2l(d.xerr), 'hover').text;
            if(d.xerrneg!==undefined) {
                d.xLabel += ' +' + xeText + ' / -' +
                    Plotly.Axes.tickText(d.xa, d.xa.c2l(d.xerrneg), 'hover').text;
            }
            else d.xLabel += ' &plusmn; ' + xeText;

            // small distance penalty for error bars, so that if there are
            // traces with errors and some without, the error bar label will
            // hoist up to the point
            if(hovermode==='x') d.distance += 1;
        }
        if(d.yerr!==undefined) {
            var yeText = Plotly.Axes.tickText(d.ya, d.ya.c2l(d.yerr), 'hover').text;
            if(d.yerrneg!==undefined) {
                d.yLabel += ' +' + yeText + ' / -' +
                    Plotly.Axes.tickText(d.ya, d.ya.c2l(d.yerrneg), 'hover').text;
            }
            else d.yLabel += ' &plusmn; ' + yeText;

            if(hovermode==='y') d.distance += 1;
        }

        var infomode = d.trace.hoverinfo;
        if(infomode!=='all') {
            infomode = infomode.split('+');
            if(infomode.indexOf('x')===-1) d.xLabel = undefined;
            if(infomode.indexOf('y')===-1) d.yLabel = undefined;
            if(infomode.indexOf('z')===-1) d.zLabel = undefined;
            if(infomode.indexOf('text')===-1) d.text = undefined;
            if(infomode.indexOf('name')===-1) d.name = undefined;
        }
        return d;
    }

    fx.loneHover = function(hoverItem, opts) {
        // draw a single hover item in a pre-existing svg container somewhere
        // hoverItem should have keys:
        //    - x and y (or x0, x1, y0, and y1):
        //      the pixel position to mark, relative to opts.container
        //    - xLabel, yLabel, zLabel, text, and name:
        //      info to go in the label
        //    - color:
        //      the background color for the label. text & outline color will
        //      be chosen black or white to contrast with this
        // opts should have keys:
        //    - bgColor:
        //      the background color this is against, used if the trace is
        //      non-opaque, and for the name, which goes outside the box
        //    - container:
        //      a dom <svg> element - must be big enough to contain the whole
        //      hover label
        var pointData = {
            color: hoverItem.color || '#444',
            x0: hoverItem.x0 || hoverItem.x || 0,
            x1: hoverItem.x1 || hoverItem.x || 0,
            y0: hoverItem.y0 || hoverItem.y || 0,
            y1: hoverItem.y1 || hoverItem.y || 0,
            xLabel: hoverItem.xLabel,
            yLabel: hoverItem.yLabel,
            zLabel: hoverItem.zLabel,
            text: hoverItem.text,
            name: hoverItem.name,

            // filler to make createHoverText happy
            trace: {index: 0},
            xa: {_offset:0},
            ya: {_offset:0},
            index: 0
        };

        var container3 = d3.select(opts.container);

        var fullOpts = {
            hovermode: 'closest',
            rotateLabels: false,
            bgColor: opts.bgColor || '#fff',
            container: container3,
            outerContainer: container3
        };

        var hoverLabel = createHoverText([pointData], fullOpts);
        alignHoverText(hoverLabel, fullOpts.rotateLabels);

        return hoverLabel.node();
    };

    function createHoverText(hoverData, opts) {
        var hovermode = opts.hovermode,
            rotateLabels = opts.rotateLabels,
            bgColor = opts.bgColor,
            container = opts.container,
            outerContainer = opts.outerContainer,

            c0 = hoverData[0],
            xa = c0.xa,
            ya = c0.ya,
            commonAttr = hovermode==='y' ? 'yLabel' : 'xLabel',
            t0 = c0[commonAttr],
            t00 = (t0||'').split(' ')[0],
            outerContainerBB = outerContainer.node().getBoundingClientRect(),
            outerTop = outerContainerBB.top,
            outerWidth = outerContainerBB.width,
            outerHeight = outerContainerBB.height;

        // show the common label, if any, on the axis
        // never show a common label in array mode,
        // even if sometimes there could be one
        var showCommonLabel = c0.distance<=fx.MAXDIST &&
                              (hovermode==='x' || hovermode==='y');

        var commonLabel = container.selectAll('g.axistext')
            .data(showCommonLabel ? [0] : []);
        commonLabel.enter().append('g')
            .classed('axistext', true);
        commonLabel.exit().remove();

        commonLabel.each(function() {
            var label = d3.select(this),
                lpath = label.selectAll('path').data([0]),
                ltext = label.selectAll('text').data([0]);

            lpath.enter().append('path')
                .style({fill: '#444', 'stroke-width': '1px', stroke: '#fff'});
            ltext.enter().append('text')
                .call(Plotly.Drawing.font, HOVERFONT, HOVERFONTSIZE, '#fff')
                // prohibit tex interpretation until we can handle
                // tex and regular text together
                .attr('data-notex',1);

            ltext.text(t0)
                .call(Plotly.util.convertToTspans)
                .call(Plotly.Drawing.setPosition, 0, 0)
              .selectAll('tspan.line')
                .call(Plotly.Drawing.setPosition, 0, 0);
            label.attr('transform','');

            var tbb = ltext.node().getBoundingClientRect();
            if(hovermode==='x'){
                ltext.attr('text-anchor','middle')
                    .call(Plotly.Drawing.setPosition,0,(xa.side==='top' ?
                        (outerTop-tbb.bottom-HOVERARROWSIZE-HOVERTEXTPAD) :
                        (outerTop-tbb.top+HOVERARROWSIZE+HOVERTEXTPAD)))
                    .selectAll('tspan.line')
                        .attr({x:ltext.attr('x'), y:ltext.attr('y')});

                var topsign = xa.side==='top' ? '-' : '';
                lpath.attr('d','M0,0'+
                    'L'+HOVERARROWSIZE+','+topsign+HOVERARROWSIZE+
                    'H'+(HOVERTEXTPAD+tbb.width/2)+
                    'v'+topsign+(HOVERTEXTPAD*2+tbb.height)+
                    'H-'+(HOVERTEXTPAD+tbb.width/2)+
                    'V'+topsign+HOVERARROWSIZE+'H-'+HOVERARROWSIZE+'Z');

                label.attr('transform','translate(' +
                    (xa._offset+(c0.x0+c0.x1)/2)+',' +
                    (ya._offset + (xa.side==='top' ? 0 : ya._length))+')');
            }
            else {
                ltext.attr('text-anchor',ya.side==='right' ? 'start' : 'end')
                    .call(Plotly.Drawing.setPosition,
                        (ya.side==='right' ? 1 : -1)*(HOVERTEXTPAD+HOVERARROWSIZE),
                        outerTop-tbb.top-tbb.height/2)
                    .selectAll('tspan.line')
                        .attr({x:ltext.attr('x'), y:ltext.attr('y')});

                var leftsign = ya.side==='right' ? '' : '-';
                lpath.attr('d','M0,0'+
                    'L'+leftsign+HOVERARROWSIZE+','+HOVERARROWSIZE+
                    'V'+(HOVERTEXTPAD+tbb.height/2)+
                    'h'+leftsign+(HOVERTEXTPAD*2+tbb.width)+
                    'V-'+(HOVERTEXTPAD+tbb.height/2)+
                    'H'+leftsign+HOVERARROWSIZE+'V-'+HOVERARROWSIZE+'Z');

                label.attr('transform','translate(' +
                    (xa._offset+(ya.side==='right' ? xa._length : 0))+',' +
                    (ya._offset+(c0.y0+c0.y1)/2)+')');
            }
            // remove the "close but not quite" points
            // because of error bars, only take up to a space
            hoverData = hoverData.filter(function(d){
                return (d.zLabelVal!==undefined) ||
                    (d[commonAttr]||'').split(' ')[0]===t00;
            });
        });

        // show all the individual labels

        // first create the objects
        var hoverLabels = container.selectAll('g.hovertext')
            .data(hoverData,function(d){
                return [d.trace.index,d.index,d.x0,d.y0,d.name,d.attr||''].join(',');
            });
        hoverLabels.enter().append('g')
            .classed('hovertext',true)
            .each(function() {
                var g = d3.select(this);
                // trace name label (rect and text.name)
                g.append('rect')
                    .call(Plotly.Color.fill,
                        Plotly.Color.addOpacity(bgColor, 0.8));
                g.append('text').classed('name',true)
                    .call(Plotly.Drawing.font,HOVERFONT,HOVERFONTSIZE);
                // trace data label (path and text.nums)
                g.append('path')
                    .style('stroke-width','1px');
                g.append('text').classed('nums',true)
                    .call(Plotly.Drawing.font,HOVERFONT,HOVERFONTSIZE);
            });
        hoverLabels.exit().remove();

        // then put the text in, position the pointer to the data,
        // and figure out sizes
        hoverLabels.each(function(d){
            var g = d3.select(this).attr('transform',''),
                // strip out any html elements from d.name (if it exists at all)
                // Note that this isn't an XSS vector, only because it never gets
                // attached to the DOM
                name = (d.name && d.zLabelVal===undefined) ?
                    $('<p>'+d.name+'</p>').text() : '',
                // combine possible non-opaque trace color with bgColor
                traceColor = combineColors(Plotly.Color.opacity(d.color) ? d.color : '#444', bgColor),
                traceRGB = tinycolor(traceColor).toRgb(),

                // find a contrasting color for border and text
                // see http://stackoverflow.com/questions/596216/
                //      formula-to-determine-brightness-of-rgb-color
                contrastColor =
                    (0.299*traceRGB.r + 0.587*traceRGB.g + 0.114*traceRGB.b)>128 ?
                    '#000' : '#FFF',
                text = '';


            if(name.length>15) name = name.substr(0,12)+'...';

            if(d.zLabel!==undefined) {
                if(d.xLabel!==undefined) text += 'x: ' + d.xLabel + '<br>';
                if(d.yLabel!==undefined) text += 'y: ' + d.yLabel + '<br>';
                text += (text ? 'z: ' : '') + d.zLabel;
            }
            else if(showCommonLabel && d[hovermode+'Label']===t0) {
                text = d[(hovermode==='x' ? 'y' : 'x') + 'Label'] || '';
            }
            else if(d.xLabel===undefined) {
                if(d.yLabel!==undefined) text = d.yLabel;
            }
            else if(d.yLabel===undefined) text = d.xLabel;
            else text = '('+d.xLabel+', '+d.yLabel+')';

            if(d.text) text += (text ? '<br>' : '') + d.text;

            var tx = g.select('text.nums')
                .style('fill',contrastColor)
                .call(Plotly.Drawing.setPosition,0,0)
                .text(text)
                .attr('data-notex',1)
                .call(Plotly.util.convertToTspans);
            tx.selectAll('tspan.line')
                .call(Plotly.Drawing.setPosition,0,0);

            var tx2 = g.select('text.name'),
                tx2width = 0;

            if(name) {
                tx2.style('fill',traceColor)
                    .text(name)
                    .call(Plotly.Drawing.setPosition,0,0)
                    .attr('data-notex',1)
                    .call(Plotly.util.convertToTspans);
                tx2.selectAll('tspan.line')
                    .call(Plotly.Drawing.setPosition,0,0);
                tx2width = tx2.node().getBoundingClientRect().width+2*HOVERTEXTPAD;
            }
            else {
                tx2.remove();
                g.select('rect').remove();
            }

            g.select('path')
                .style({fill:traceColor, stroke:contrastColor});
            var tbb = tx.node().getBoundingClientRect(),
                htx = xa._offset+(d.x0+d.x1)/2,
                hty = ya._offset+(d.y0+d.y1)/2,
                dx = Math.abs(d.x1-d.x0),
                dy = Math.abs(d.y1-d.y0),
                txTotalWidth = tbb.width+HOVERARROWSIZE+HOVERTEXTPAD+tx2width;
            d.ty0 = outerTop-tbb.top;
            d.bx = tbb.width+2*HOVERTEXTPAD;
            d.by = tbb.height+2*HOVERTEXTPAD;
            d.anchor = 'start';
            d.txwidth = tbb.width;
            d.tx2width = tx2width;
            d.offset = 0;
            if(rotateLabels) {
                d.pos = htx;
                hty += dy/2;
                if(hty+txTotalWidth > outerHeight) {
                    d.anchor = 'end';
                    hty -= dy;
                    if(hty-txTotalWidth<0) {
                        d.anchor = 'middle';
                        hty +=dy/2;
                    }
                }
            }
            else {
                d.pos = hty;
                htx += dx/2;
                if(htx+txTotalWidth > outerWidth) {
                    d.anchor = 'end';
                    htx -=dx;
                    if(htx-txTotalWidth<0) {
                        d.anchor = 'middle';
                        htx += dx/2;
                    }
                }
            }
            tx.attr('text-anchor',d.anchor);
            if(tx2width) tx2.attr('text-anchor',d.anchor);
            g.attr('transform','translate('+htx+','+hty+')'+
                (rotateLabels ? 'rotate('+YANGLE+')' : ''));
        });

        return hoverLabels;
    }

    // Make groups of touching points, and within each group
    // move each point so that no labels overlap, but the average
    // label position is the same as it was before moving. Indicentally,
    // this is equivalent to saying all the labels are on equal linear
    // springs about their initial position. Initially, each point is
    // its own group, but as we find overlaps we will clump the points.
    //
    // Also, there are hard constraints at the edges of the graphs,
    // that push all groups to the middle so they are visible. I don't
    // know what happens if the group spans all the way from one edge to
    // the other, though it hardly matters - there's just too much
    // information then.
    function hoverAvoidOverlaps(hoverData, ax) {
        var nummoves = 0,
            pmin = ax._offset,
            pmax = ax._offset+ax._length,

            // make groups of touching points
            pointgroups = hoverData
                .map(function(d,i){
                    return [{
                        i: i,
                        dp: 0,
                        pos: d.pos,
                        posref: d.posref,
                        size: d.by*(ax._id.charAt(0)==='x' ? YFACTOR : 1)/2
                    }];
                })
                .sort(function(a,b){ return a[0].posref-b[0].posref; }),
            donepositioning,
            topOverlap,
            bottomOverlap,
            i, j,
            pti,
            sumdp;

        function constrainGroup(grp){
            var minPt = grp[0],
                maxPt = grp[grp.length-1];

            // overlap with the top - positive vals are overlaps
            topOverlap = pmin-minPt.pos-minPt.dp+minPt.size;

            // overlap with the bottom - positive vals are overlaps
            bottomOverlap = maxPt.pos+maxPt.dp+maxPt.size-pmax;

            // check for min overlap first, so that we always
            // see the largest labels
            // allow for .01px overlap, so we don't get an
            // infinite loop from rounding errors
            if(topOverlap>0.01) {
                for(j=grp.length-1; j>=0; j--) grp[j].dp += topOverlap;
                donepositioning = false;
            }
            if(bottomOverlap<0.01) return;
            if(topOverlap<-0.01) {
                // make sure we're not pushing back and forth
                for(j=grp.length-1; j>=0; j--) grp[j].dp -= bottomOverlap;
                donepositioning = false;
            }
            if(!donepositioning) return;

            // no room to fix positioning, delete off-screen points

            // first see how many points we need to delete
            var deleteCount = 0;
            for(i=0; i<grp.length; i++) {
                pti = grp[i];
                if(pti.pos+pti.dp+pti.size>pmax) deleteCount++;
            }

            // start by deleting points whose data is off screen
            for(i=grp.length-1; i>=0; i--) {
                if(deleteCount<=0) break;
                pti = grp[i];

                // pos has already been constrained to [pmin,pmax]
                // so look for points close to that to delete
                if(pti.pos>pmax-1) {
                    pti.del = true;
                    deleteCount--;
                }
            }
            for(i=0; i<grp.length; i++) {
                if(deleteCount<=0) break;
                pti = grp[i];

                // pos has already been constrained to [pmin,pmax]
                // so look for points close to that to delete
                if(pti.pos<pmin+1) {
                    pti.del = true;
                    deleteCount--;

                    // shift the whole group minus into this new space
                    bottomOverlap = pti.size*2;
                    for(j=grp.length-1; j>=0; j--) grp[j].dp -= bottomOverlap;
                }
            }
            // then delete points that go off the bottom
            for(i=grp.length-1; i>=0; i--) {
                if(deleteCount<=0) break;
                pti = grp[i];
                if(pti.pos+pti.dp+pti.size>pmax) {
                    pti.del = true;
                    deleteCount--;
                }
            }
        }

        // loop through groups, combining them if they overlap,
        // until nothing moves
        while(!donepositioning && nummoves<=hoverData.length) {
            // to avoid infinite loops, don't move more times
            // than there are traces
            nummoves++;

            // assume nothing will move in this iteration,
            // reverse this if it does
            donepositioning = true;
            i = 0;
            while(i<pointgroups.length-1) {
                    // the higher (g0) and lower (g1) point group
                var g0 = pointgroups[i],
                    g1 = pointgroups[i+1],

                    // the lowest point in the higher group (p0)
                    // the highest point in the lower group (p1)
                    p0 = g0[g0.length-1],
                    p1 = g1[0];
                topOverlap = p0.pos+p0.dp+p0.size-p1.pos-p1.dp+p1.size;
                if(topOverlap>0.01) {
                    // push the new point(s) added to this group out of the way
                    for(j=g1.length-1; j>=0; j--) g1[j].dp += topOverlap;

                    // add them to the group
                    g0.push.apply(g0,g1);
                    pointgroups.splice(i+1,1);

                    // adjust for minimum average movement
                    sumdp = 0;
                    for(j=g0.length-1; j>=0; j--) sumdp += g0[j].dp;
                    bottomOverlap = sumdp/g0.length;
                    for(j=g0.length-1; j>=0; j--) g0[j].dp -= bottomOverlap;
                    donepositioning = false;
                }
                else i++;
            }

            // check if we're going off the plot on either side and fix
            pointgroups.forEach(constrainGroup);
        }

        // now put these offsets into hoverData
        for(i=pointgroups.length-1; i>=0; i--) {
            var grp = pointgroups[i];
            for(j=grp.length-1; j>=0; j--) {
                var pt = grp[j],
                    hoverPt = hoverData[pt.i];
                hoverPt.offset = pt.dp;
                hoverPt.del = pt.del;
            }
        }
    }

    function alignHoverText(hoverLabels, rotateLabels) {
        // finally set the text positioning relative to the data and draw the
        // box around it
        hoverLabels.each(function(d){
            var g = d3.select(this);
            if(d.del) {
                g.remove();
                return;
            }
            var horzSign = d.anchor==='end' ? -1 : 1,
                tx = g.select('text.nums'),
                alignShift = {start:1,end:-1,middle:0}[d.anchor],
                txx = alignShift*(HOVERARROWSIZE+HOVERTEXTPAD),
                tx2x = txx+alignShift*(d.txwidth+HOVERTEXTPAD),
                offsetX = 0,
                offsetY = d.offset;
            if(d.anchor==='middle') {
                txx-=d.tx2width/2;
                tx2x-=d.tx2width/2;
            }
            if(rotateLabels) {
                offsetY *= -YSHIFTY;
                offsetX = d.offset*YSHIFTX;
            }

            g.select('path').attr('d',d.anchor==='middle' ?
                // middle aligned: rect centered on data
                ('M-'+(d.bx/2)+',-'+(d.by/2)+'h'+d.bx+'v'+d.by+'h-'+d.bx+'Z') :
                // left or right aligned: side rect with arrow to data
                ('M0,0L'+(horzSign*HOVERARROWSIZE+offsetX)+','+(HOVERARROWSIZE+offsetY)+
                    'v'+(d.by/2-HOVERARROWSIZE)+
                    'h'+(horzSign*d.bx)+
                    'v-'+d.by+
                    'H'+(horzSign*HOVERARROWSIZE+offsetX)+
                    'V'+(offsetY-HOVERARROWSIZE)+
                    'Z'));

            tx.call(Plotly.Drawing.setPosition,
                    txx+offsetX, offsetY+d.ty0-d.by/2+HOVERTEXTPAD)
                .selectAll('tspan.line')
                    .attr({x:tx.attr('x'), y:tx.attr('y')});

            if(d.tx2width) {
                g.select('text.name, text.name tspan.line')
                    .call(Plotly.Drawing.setPosition,
                        tx2x+alignShift*HOVERTEXTPAD+offsetX,
                        offsetY+d.ty0-d.by/2+HOVERTEXTPAD);
                g.select('rect')
                    .call(Plotly.Drawing.setRect,
                        tx2x+(alignShift-1)*d.tx2width/2+offsetX,
                        offsetY-d.by/2-1,
                        d.tx2width, d.by+2);
            }
        });
    }

    function hoverChanged(gd, evt, oldhoverdata) {
        // don't trigger any events if nothing changed or
        // if fx.hover was called manually
        if(!evt.target) return false;
        if(!oldhoverdata || oldhoverdata.length!==gd._hoverdata.length) return true;

        for(var i = oldhoverdata.length-1; i>=0; i--) {
            var oldPt = oldhoverdata[i],
                newPt = gd._hoverdata[i];
            if(oldPt.curveNumber!==newPt.curveNumber ||
                    String(oldPt.pointNumber)!==String(newPt.pointNumber)) {
                return true;
            }
        }
        return false;
    }

    // remove hover effects on mouse out, and trigger unhover event
    function unhover(gd, evt){
        var fullLayout = gd._fullLayout;
        if(!evt) evt = {};
        if(typeof gd === 'string') gd = document.getElementById(gd);
        if(evt.target &&
                $(gd).triggerHandler('plotly_beforehover',evt)===false) {
            return;
        }
        fullLayout._hoverlayer.selectAll('g').remove();
        if(evt.target && gd._hoverdata) {
            $(gd).trigger('plotly_unhover', {points: gd._hoverdata});
        }
        gd._hoverdata = undefined;
    }

    // on click
    fx.click = function(gd,evt){
        if(gd._hoverdata && evt && evt.target) {
            $(gd).trigger('plotly_click', {points: gd._hoverdata});
            // why do we get a double event without this???
            evt.stopImmediatePropagation();
        }
    };

    // dragmode and hovermode toolbars
    fx.modeBar = function(gd){

        function initModebar(){

            var modebar = new Plotly.ModeBar({
                buttons: buttons,
                container: fullLayout._paperdiv.node(),
                Plotly: Plotly,
                graphInfo: gd
            });

            if(fullLayout._privateplot) {
                $(modebar.element).append(
                    '<span class="badge-private float--left">PRIVATE</span>'
                );
            }

            return modebar;
        }

        function deleteModebar() {
            var modebarUI = gd.querySelector('.modebar');
            if (modebarUI) modebarUI.parentNode.removeChild(modebarUI);
        }

        var modebar,
            fullLayout = gd._fullLayout || {};

        // Is modebar forbidden? explicitly turned off, or 3D present but not supported
        if (!gd._context.displayModeBar ||
                (fullLayout._hasGL3D && fullLayout._noGL3DSupport)) {
            deleteModebar();
            return;
        }

        var modeButtons2d = [
                ['zoom2d', 'pan2d'],
                ['zoomIn2d', 'zoomOut2d', 'autoScale2d'],
                ['hoverClosest2d', 'hoverCompare2d']
            ],
            modeButtons3d = [
                ['rotate3d', 'zoom3d', 'pan3d'],
                ['resetCameraDefault3d', 'resetCameraLastSave3d'],
                ['hoverClosest3d']
            ],
            buttons = fullLayout._hasGL3D ? modeButtons3d : modeButtons2d;

        if (!fullLayout._modebar){
            deleteModebar();
            fullLayout._modebar = initModebar();
        }

        modebar = fullLayout._modebar;

        //if the buttons are different, clean old and init new modebar
        if (!modebar.hasButtons(buttons)) {
            fullLayout._modebar.cleanup();
            fullLayout._modebar = initModebar();
        }
    };

    // ----------------------------------------------------
    // Axis dragging functions
    // ----------------------------------------------------

    // flag for showing "doubleclick to zoom out" only at the beginning
    var SHOWZOOMOUTTIP = true;

    // dragBox: create an element to drag one or more axis ends
    // inputs:
    //      plotinfo - which subplot are we making dragboxes on?
    //      x,y,w,h - left, top, width, height of the box
    //      ns - how does this drag the vertical axis?
    //          'n' - top only
    //          's' - bottom only
    //          'ns' - top and bottom together, difference unchanged
    //      ew - same for horizontal axis
    function dragBox(gd, plotinfo, x, y, w, h, ns, ew) {
        // mouseDown stores ms of first mousedown event in the last
        // DBLCLICKDELAY ms on the drag bars
        // numClicks stores how many mousedowns have been seen
        // within DBLCLICKDELAY so we can check for click or doubleclick events
        // dragged stores whether a drag has occurred, so we don't have to
        // redraw unnecessarily, ie if no move bigger than MINDRAG or MINZOOM px
        var fullLayout = gd._fullLayout,
            xa = [plotinfo.x()],
            ya = [plotinfo.y()],
            pw = xa[0]._length,
            ph = ya[0]._length,
            cursor = (ns+ew==='nsew') ?
                ({pan:'move',zoom:'crosshair'}[fullLayout.dragmode]) :
                (ns+ew).toLowerCase()+'-resize',
            dragClass = ns+ew+'drag',
            // if we're dragging two axes at once, also drag overlays
            subplots = [plotinfo].concat((ns && ew) ? plotinfo.overlays : []),
            dragger = plotinfo.draglayer.selectAll('.'+dragClass).data([0]);

        dragger.enter().append('rect')
            .classed('drag',true)
            .classed(dragClass,true)
            .style({fill:'black', opacity:0, 'stroke-width':0})
            .attr('data-subplot', plotinfo.id);
        dragger.call(Plotly.Drawing.setRect, x,y,w,h)
            .call(fx.setCursor,cursor);
        dragger = dragger.node();

        subplots.forEach(function(subplot) {
            var subplotXa = subplot.x(),
                subplotYa = subplot.y();
            if(xa.indexOf(subplotXa)===-1) xa.push(subplotXa);
            if(ya.indexOf(subplotYa)===-1) ya.push(subplotYa);
        });

        function getAxId(ax) { return ax._id; }
        var xids = xa.map(getAxId),
            yids = ya.map(getAxId),
            allaxes = xa.concat(ya);

        function forceNumber(ax) { ax.range = ax.range.map(Number); }

        var dragOptions = {
            element: dragger,
            prepFn: function(e, startX, startY) {
                if(ns+ew==='nsew' && ((fullLayout.dragmode==='zoom') ?
                    !e.shiftKey : e.shiftKey)) {
                    dragOptions.moveFn = zoomMove;
                    dragOptions.doneFn = zoomDone;
                    zoomPrep(e, startX, startY);
                } else {
                    dragOptions.moveFn = plotDrag;
                    dragOptions.doneFn = dragDone;
                }
            }
        };

        fx.dragElement(dragOptions);

        var x0,
            y0,
            box,
            lum,
            path0,
            dimmed,
            zoomMode,
            zb,
            corners;

        function zoomPrep(e, startX, startY) {
            var dragBBox = dragger.getBoundingClientRect();
            x0 = startX - dragBBox.left;
            y0 = startY - dragBBox.top;
            box = {l: x0, r: x0, w: 0, t: y0, b: y0, h: 0};
            lum = gd._hmpixcount ?
                (gd._hmlumcount / gd._hmpixcount) :
                tinycolor(gd._fullLayout.plot_bgcolor).toHsl().l;
            path0 = path0 = 'M0,0H'+pw+'V'+ph+'H0V0';
            dimmed = false;
            zoomMode = 'xy';

            zb = plotinfo.plot.append('path')
                .attr('class', 'zoombox')
                .style({
                    'fill': lum>0.2 ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)',
                    'stroke-width': 0
                })
                .attr('d', path0 + 'Z');

            corners = plotinfo.plot.append('path')
                .attr('class', 'zoombox-corners')
                .style({
                    fill: '#FFF',
                    stroke: '#444',
                    'stroke-width': 1,
                    opacity: 0
                })
                .attr('d','M0,0Z');

            xa.forEach(forceNumber);
            ya.forEach(forceNumber);
        }

        function zoomMove(dx0, dy0) {
            var x1 = Math.max(0, Math.min(pw, dx0 + x0)),
                y1 = Math.max(0, Math.min(ph, dy0 + y0)),
                dx = Math.abs(x1 - x0),
                dy = Math.abs(y1 - y0),
                clen = Math.floor(Math.min(dy, dx, fx.MINZOOM) / 2);

            box.l = Math.min(x0, x1);
            box.r = Math.max(x0, x1);
            box.t = Math.min(y0, y1);
            box.b = Math.max(y0, y1);

            // look for small drags in one direction or the other,
            // and only drag the other axis
            if(dy < Math.min(Math.max(dx * 0.6, fx.MINDRAG), fx.MINZOOM)) {
                if(dx < fx.MINDRAG) {
                    zoomMode = '';
                    box.r = box.l;
                    box.t = box.b;
                    corners.attr('d', 'M0,0Z');
                }
                else {
                    box.t = 0;
                    box.b = ph;
                    zoomMode = 'x';
                    corners.attr('d',
                        'M'+(box.l-0.5)+','+(y0-fx.MINZOOM-0.5)+
                        'h-3v'+(2*fx.MINZOOM+1)+'h3ZM'+
                        (box.r+0.5)+','+(y0-fx.MINZOOM-0.5)+
                        'h3v'+(2*fx.MINZOOM+1)+'h-3Z');
                }
            }
            else if(dx < Math.min(dy * 0.6, fx.MINZOOM)) {
                box.l = 0;
                box.r = pw;
                zoomMode = 'y';
                corners.attr('d',
                    'M'+(x0-fx.MINZOOM-0.5)+','+(box.t-0.5)+
                    'v-3h'+(2*fx.MINZOOM+1)+'v3ZM'+
                    (x0-fx.MINZOOM-0.5)+','+(box.b+0.5)+
                    'v3h'+(2*fx.MINZOOM+1)+'v-3Z');
            }
            else {
                zoomMode = 'xy';
                corners.attr('d',
                    'M'+(box.l-3.5)+','+(box.t-0.5+clen)+'h3v'+(-clen)+
                            'h'+clen+'v-3h-'+(clen+3)+'ZM'+
                        (box.r+3.5)+','+(box.t-0.5+clen)+'h-3v'+(-clen)+
                            'h'+(-clen)+'v-3h'+(clen+3)+'ZM'+
                        (box.r+3.5)+','+(box.b+0.5-clen)+'h-3v'+clen+
                            'h'+(-clen)+'v3h'+(clen+3)+'ZM'+
                        (box.l-3.5)+','+(box.b+0.5-clen)+'h3v'+clen+
                            'h'+clen+'v3h-'+(clen+3)+'Z');
            }
            box.w = box.r - box.l;
            box.h = box.b - box.t;

            // Not sure about the addition of window.scrollX/Y...
            // seems to work but doesn't seem robust.
            zb.attr('d',
                path0+'M'+(box.l)+','+(box.t)+'v'+(box.h)+
                'h'+(box.w)+'v-'+(box.h)+'h-'+(box.w)+'Z');
            if(!dimmed) {
                zb.transition()
                    .style('fill', lum>0.2 ? 'rgba(0,0,0,0.4)' :
                        'rgba(255,255,255,0.3)')
                    .duration(200);
                corners.transition()
                    .style('opacity',1)
                    .duration(200);
                dimmed = true;
            }
        }

        function zoomDone(dragged, numClicks) {
            if(Math.min(box.h, box.w) < fx.MINDRAG * 2) {
                // doubleclick - autoscale
                if(numClicks === 2) dragAutoRange();
                else pauseForDrag(gd);

                return removeZoombox();
            }

            if(zoomMode.indexOf('x')>-1) {
                xa.forEach(function(xai) {
                    var xr = xai.range;
                    xai.range = [
                        xr[0]+(xr[1]-xr[0])*(box.l)/pw,
                        xr[0]+(xr[1]-xr[0])*(box.r)/pw
                    ];
                });
            }
            if(zoomMode.indexOf('y')>-1) {
                ya.forEach(function(yai) {
                    var yr = yai.range;
                    yai.range=[
                        yr[0]+(yr[1]-yr[0])*(ph-box.b)/ph,
                        yr[0]+(yr[1]-yr[0])*(ph-box.t)/ph
                    ];
                });
            }

            removeZoombox();
            dragTail(zoomMode);

            if(SHOWZOOMOUTTIP && gd.data && !gd._context.showTips) {
                Plotly.Lib.notifier(
                    'Double-click to<br>zoom back out','long');
                SHOWZOOMOUTTIP=false;
            }
        }

        function dragDone(dragged, numClicks) {
            if(dragged) dragTail();
            else if(numClicks === 2 && (ns+ew).length!==1) dragAutoRange();
            else if(numClicks===1 &&(ns+ew).length===1) dragInput(dragger);
            else pauseForDrag(gd);
        }

        // scroll zoom, on all draggers except corners
        var scrollViewBox = [0,0,pw,ph],
            // wait a little after scrolling before redrawing
            redrawTimer = null,
            REDRAWDELAY = 300,
            mainplot = plotinfo.mainplot ?
                fullLayout._plots[plotinfo.mainplot] : plotinfo;

        function zoomWheel(e) {
            // deactivate mousewheel scrolling on embedded graphs
            // devs can override this with layout._enablescrollzoom,
            // but _ ensures this setting won't leave their page
            if(!gd._context.scrollZoom && !fullLayout._enablescrollzoom) {
                return;
            }
            var pc = $(gd).find('.plotly')[0];

            // if the plot has scrollbars (more than a tiny excess)
            // disable scrollzoom too.
            if(pc.scrollHeight-pc.clientHeight>10 ||
                    pc.scrollWidth-pc.clientWidth>10) {
                return;
            }

            clearTimeout(redrawTimer);

            var zoom = Math.exp(-Math.min(Math.max(-e.deltaY, -20), 20) / 100),
                gbb = mainplot.draglayer.select('.nsewdrag')
                    .node().getBoundingClientRect(),
                xfrac = (e.clientX - gbb.left) / gbb.width,
                vbx0 = scrollViewBox[0] + scrollViewBox[2]*xfrac,
                yfrac = (gbb.bottom - e.clientY)/gbb.height,
                vby0 = scrollViewBox[1]+scrollViewBox[3]*(1-yfrac);

            if(ew) {
                xa.forEach(function(xai) {
                    forceNumber(xai);
                    var x0 = xai.range[0]+(xai.range[1]-xai.range[0])*xfrac;
                    xai.range = [x0+(xai.range[0]-x0)*zoom,
                        x0+(xai.range[1]-x0)*zoom];
                });
                scrollViewBox[2] *= zoom;
                scrollViewBox[0] = vbx0-scrollViewBox[2]*xfrac;
            }
            if(ns) {
                ya.forEach(function(yai) {
                    forceNumber(yai);
                    var y0 = yai.range[0]+(yai.range[1]-yai.range[0])*yfrac;
                    yai.range = [y0+(yai.range[0]-y0)*zoom,
                        y0+(yai.range[1]-y0)*zoom];
                });
                scrollViewBox[3] *= zoom;
                scrollViewBox[1] = vby0-scrollViewBox[3]*(1-yfrac);
            }

            // viewbox redraw at first
            updateViewBoxes(scrollViewBox);
            ticksAndAnnotations(ns,ew);

            // then replot after a delay to make sure
            // no more scrolling is coming
            redrawTimer = setTimeout(function(){
                scrollViewBox = [0,0,pw,ph];
                dragTail();
            }, REDRAWDELAY);

            return Plotly.Lib.pauseEvent(e);
        }

        // everything but the corners gets wheel zoom
        if(ns.length*ew.length!==1) {
            // still seems to be some confusion about onwheel vs onmousewheel...
            if(dragger.onwheel!==undefined) dragger.onwheel = zoomWheel;
            else if(dragger.onmousewheel!==undefined) dragger.onmousewheel = zoomWheel;
        }

        // plotDrag: move the plot in response to a drag
        function plotDrag(dx,dy) {
            if(ew==='ew' || ns==='ns') {
                if(ew) {
                    xa.forEach(function(xai) {
                        xai.range = [xai._r[0]-dx/xai._m, xai._r[1]-dx/xai._m];
                    });
                }
                if(ns) {
                    ya.forEach(function(yai) {
                        yai.range = [yai._r[0]-dy/yai._m, yai._r[1]-dy/yai._m];
                    });
                }
                updateViewBoxes([ew?-dx:0, ns?-dy:0, pw, ph]);
                ticksAndAnnotations(ns,ew);
                return;
            }

            // common transform for dragging one end of an axis
            // d>0 is compressing scale (cursor is over the plot,
            //  the axis end should move with the cursor)
            // d<0 is expanding (cursor is off the plot, axis end moves
            //  nonlinearly so you can expand far)
            function dZoom(d) {
                return 1-((d>=0) ? Math.min(d,0.9) :
                    1/(1/Math.max(d,-0.3)+3.222));
            }

            // dz: set a new value for one end (0 or 1) of an axis array ax,
            // and return a pixel shift for that end for the viewbox
            // based on pixel drag distance d
            // TODO: this makes (generally non-fatal) errors when you get
            // near floating point limits
            function dz(ax,end,d) {
                ax.forEach(function(axi) {
                    axi.range[end] = axi._r[1-end] +
                        (axi._r[end]-axi._r[1-end])/dZoom(d/axi._length);
                });
                return ax[0]._length * (ax[0]._r[end]-ax[0].range[end]) /
                    (ax[0]._r[end]-ax[0]._r[1-end]);
            }

            if(ew==='w') { dx = dz(xa,0,dx); }
            else if(ew==='e') { dx = dz(xa,1,-dx); }
            else if(!ew) { dx = 0; }

            if(ns==='n') { dy = dz(ya,1,dy); }
            else if(ns==='s') { dy = dz(ya,0,-dy); }
            else if(!ns) { dy = 0; }

            updateViewBoxes([(ew==='w')?dx:0, (ns==='n')?dy:0, pw-dx, ph-dy]);
            ticksAndAnnotations(ns,ew);
        }

        function ticksAndAnnotations(ns,ew){
            var annotations = fullLayout.annotations || [],
                shapes = fullLayout.shapes || [],
                i,
                obji;

            if(ew) Plotly.Axes.doTicks(gd, xa._id, true);
            if(ns) Plotly.Axes.doTicks(gd, ya._id, true);

            for(i = 0; i < annotations.length; i++) {
                obji = annotations[i];
                if( (ew && xids.indexOf(obji.xref)!==-1) ||
                        (ns && yids.indexOf(obji.yref)!==-1) ) {
                    Plotly.Annotations.draw(gd,i);
                }
            }

            for(i = 0; i < shapes.length; i++) {
                obji = shapes[i];
                if( (ew && xids.indexOf(obji.xref)!==-1) ||
                        (ns && yids.indexOf(obji.yref)!==-1) ) {
                    Plotly.Shapes.draw(gd,i);
                }
            }
        }

        // dragAutoRange - set one or both axes to autorange on doubleclick
        function dragAutoRange() {
            var attrs={};
            (ew ? xa : []).concat(ns ? ya : []).forEach(function(axi) {
                attrs[axi._name+'.autorange']=true;
            });
            Plotly.relayout(gd,attrs);
        }

        // dragTail - finish a drag event with a redraw
        function dragTail(zoommode) {
            var attrs = {};
            // revert to the previous axis settings, then apply the new ones
            // through relayout - this lets relayout manage undo/redo
            allaxes.forEach(function(axi) {
                if(zoommode && zoommode.indexOf(axi._id.charAt(0))===-1) {
                    return;
                }
                [0,1].forEach(function(i) {
                    if(axi._r[i]!==axi.range[i]) {
                        attrs[axi._name+'.range['+i+']']=axi.range[i];
                    }
                });
                axi.range=axi._r.slice();
            });
            updateViewBoxes([0,0,pw,ph]);
            Plotly.relayout(gd,attrs);
        }

        // updateViewBoxes - find all plot viewboxes that should be
        // affected by this drag, and update them. look for all plots
        // sharing an affected axis (including the one being dragged)
        function updateViewBoxes(viewBox) {
            Object.keys(fullLayout._plots).forEach(function(subplot) {
                var plotinfo2 = fullLayout._plots[subplot],
                    xa2 = plotinfo2.x(),
                    ya2 = plotinfo2.y(),
                    editX = ew && xa.indexOf(xa2)!==-1,
                    editY = ns && ya.indexOf(ya2)!==-1;

                if(editX || editY) {
                    var newVB = [0,0,xa2._length,ya2._length];
                    if(editX) {
                        newVB[0] = viewBox[0];
                        newVB[2] = viewBox[2];
                    }
                    if(editY) {
                        newVB[1] = viewBox[1];
                        newVB[3] = viewBox[3];
                    }
                    plotinfo2.plot.attr('viewBox',newVB.join(' '));
                }
            });
        }

        return dragger;
    }

    function pauseForDrag(gd) {
        // prevent more redraws until we know if a doubleclick
        // has occurred
        gd._dragging = true;
        var deferredReplot = gd._replotPending;
        gd._replotPending = false;

        setTimeout(function() {
                gd._replotPending = deferredReplot;
                finishDrag(gd);
            },
            fx.DBLCLICKDELAY);
    }

    function finishDrag(gd) {
        gd._dragging = false;
        if(gd._replotPending) Plotly.plot(gd);
    }

    function removeZoombox() {
        $('.zoombox,.js-zoombox-backdrop,.js-zoombox-menu,.zoombox-corners').remove();
    }

    // for automatic alignment on dragging, <1/3 means left align,
    // >2/3 means right, and between is center. Pick the right fraction
    // based on where you are, and return the fraction corresponding to
    // that position on the object
    fx.dragAlign = function(v, dv, v0, v1, anchor) {
        var vmin = (v-v0)/(v1-v0),
            vmax = vmin+dv/(v1-v0),
            vc = (vmin+vmax)/2;

        // explicitly specified anchor
        if(anchor==='left' || anchor==='bottom') return vmin;
        if(anchor==='center' || anchor==='middle') return vc;
        if(anchor==='right' || anchor==='top') return vmax;

        // automatic based on position
        if(vmin<(2/3)-vc) return vmin;
        if(vmax>(4/3)-vc) return vmax;
        return vc;
    };


    // set cursors pointing toward the closest corner/side,
    // to indicate alignment
    // x and y are 0-1, fractions of the plot area
    var cursorset = [['sw-resize','s-resize','se-resize'],
                ['w-resize','move','e-resize'],
                ['nw-resize','n-resize','ne-resize']];
    fx.dragCursors = function(x,y,xanchor,yanchor){
        if(xanchor==='left') x=0;
        else if(xanchor==='center') x=1;
        else if(xanchor==='right') x=2;
        else x = Plotly.Lib.constrain(Math.floor(x*3),0,2);

        if(yanchor==='bottom') y=0;
        else if(yanchor==='middle') y=1;
        else if(yanchor==='top') y=2;
        else y = Plotly.Lib.constrain(Math.floor(y*3),0,2);

        return cursorset[y][x];
    };

    // -----------------------------------------------------
    // Auto-grow text input, for editing graph items
    // from http://jsbin.com/ahaxe, heavily edited
    // -----------------------------------------------------
    // TODO: switch to Plotly.Util.makeEditable and remove?
    // only draggers use this any more

    // dragInput - make an editbox that grows with the text you
    // type in it, for editing values on a plot
    //      eln - the DOM element to edit
    function dragInput(eln) {
        var gd = $(eln).parents('.js-plotly-plot')[0],
            fullLayout = gd._fullLayout,
            el3 = d3.select(eln),

            // use the class to determine what this element is
            cls = el3.attr('class'),
            ref=$(eln),
            property, // the property to set (a nestedProperty object)
            options = {maxWidth: 1000, minWidth: 20},
            fontCss={},
            axletter,
            axid,
            ax,
            end,
            i,
            dig;

        var subplot = ($(eln).attr('data-subplot')
            .match(/(x[0-9]*)(y[0-9]*)/)||['','x','y']);
        axletter = (['n','s'].indexOf(cls.charAt(5))!==-1) ? 'y' : 'x';
        axid = subplot[axletter==='x' ? 1 : 2];
        ax = Plotly.Axes.getFromId(gd,axid);
        end = (['s','w'].indexOf(cls.charAt(5))!==-1) ? 0 : 1;
        property = Plotly.Lib.nestedProperty(fullLayout, ax._name+'.range['+end+']');
        options.align = (cls==='drag edrag' || ax.side==='right') ?
            'right' : 'left';
        ref=$(gd).find('.'+ax._id+'title'); // font properties reference

        var fa=['font-size','font-family','font-weight','font-style',
            'font-stretch','font-variant','letter-spacing','word-spacing'];
        var fapx=['font-size','letter-spacing','word-spacing'];
        for(i in fa) {
            var ra=ref.attr(fa[i]);
            if(fapx.indexOf(fa[i])>=0 && Number(ra)>0) { ra+='px'; }
            if(ra) { fontCss[fa[i]]=ra; }
        }

        options.comfortZone = 3 + (Number(
            String(fontCss['font-size']).split('px')[0]) || 20);

        var bbox = eln.getBoundingClientRect(),
            input = $('<input/>').appendTo(gd);
        gd._input = input;

        // first put the input box at 0,0, then calculate
        // the correct offset vs orig. element
        input.css(fontCss)
            .css({position:'absolute', top:0, left:0, 'z-index':6000});

        // show enough digits to specify the position
        // to about a pixel, but not more
        var v = property.get(),
            diff = Math.abs(v-ax.range[1-end]);
        if(ax.type==='date'){
            input.val(Plotly.Lib.ms2DateTime(v,diff));
        }
        else if(ax.type==='log') {
            dig = Math.ceil(Math.max(0,-Math.log(diff)/Math.LN10))+3;
            input.val(d3.format('.'+String(dig)+'g')(Math.pow(10,v)));
        }
        else { // linear numeric (or category... but just show numbers here)
            dig = Math.floor(Math.log(Math.abs(v))/Math.LN10) -
                Math.floor(Math.log(diff)/Math.LN10)+4;
            input.val(d3.format('.'+String(dig)+'g')(v));
        }

        var val = input.val(),
            testSubject = $('<tester/>').css({
                position: 'absolute',
                top: -9999,
                left: -9999,
                width: 'auto',
                whiteSpace: 'nowrap'
            })
            .css(fontCss)
            .insertAfter(input)
            .html(escaped(val));

        function testWidth(){
            return Plotly.Lib.constrain(testSubject.width()+options.comfortZone,
                options.minWidth, options.maxWidth);
        }
        input.width(testWidth());

        var ibbox=input[0].getBoundingClientRect(),ileft=bbox.left-ibbox.left;
        input.css('top',(bbox.top-ibbox.top+(bbox.height-ibbox.height)/2)+'px');

        if(options.align==='right') {
            ileft+=bbox.width-ibbox.width;
        }
        else if(options.align==='center') {
            ileft+=(bbox.width+options.comfortZone-ibbox.width)/2;
        }
        input.css('left',ileft+'px');

        var leftshift={left:0, center:0.5, right:1}[options.align];
        var left0=input.position().left+input.width()*leftshift;

        input[0].select();

        function removeInput(){
            input.remove();
            testSubject.remove();
            gd._input = null;
        }

        input.bind('keyup keydown blur update',function(e) {
            var valold = val;
            val = input.val();
            var v = $.trim(val);

            // occasionally we get two events firing...
            if(!gd._input || !fullLayout) return;

            // leave the input or press return: accept the change
            if((e.type==='blur') || (e.type==='keydown' && e.which===13)) {
                v = ax.c2l(ax.type==='category' ? v : ax.d2c(v));
                if(!$.isNumeric(v)) { return; }
                var attrs = {};
                attrs[property.astr] = v;
                Plotly.relayout(gd,attrs);
                removeInput();
            }
            else if(e.type==='keydown' && e.which===27) {
                // press escape: revert the change
                removeInput();
            }
            else if(val!==valold) {
                // If content has changed, enter in testSubject
                // and update input width & position
                testSubject.html(escaped(val));
                var newWidth = testWidth();
                input.css({width: newWidth, left: left0-newWidth*leftshift});
            }
        });
    }

    /**
     * Abstracts click & drag interactions
     * @param {object} options with keys:
     *      element (required) the DOM element to drag
     *      prepFn (optional) function(event, startX, startY)
     *          executed on mousedown
     *          startX and startY are the clientX and clientY pixel position
     *          of the mousedown event
     *      moveFn (optional) function(dx, dy, dragged)
     *          executed on move
     *          dx and dy are the net pixel offset of the drag,
     *          dragged is true/false, has the mouse moved enough to
     *          constitute a drag
     *      doneFn (optional) function(dragged, numClicks)
     *          executed on mouseup, or mouseout of window since
     *          we don't get events after that
     *          dragged is as in moveFn
     *          numClicks is how many clicks we've registered within
     *          a doubleclick time
     */
    fx.dragElement = function(options) {
        var gd = $(options.element).parents('.js-plotly-plot')[0] || {},
            numClicks = 1,
            startX,
            startY,
            newMouseDownTime,
            dragCover,
            initialTarget;

        if(!gd._mouseDownTime) gd._mouseDownTime = 0;

        function onStart(e) {
            // because we cancel event bubbling,
            // explicitly trigger input blur event.
            if(gd._input) gd._input.trigger('blur');

            // make dragging and dragged into properties of gd
            // so that others can look at and modify them
            gd._dragged = false;
            gd._dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialTarget = e.target;

            newMouseDownTime = (new Date()).getTime();
            if(newMouseDownTime - gd._mouseDownTime < fx.DBLCLICKDELAY) {
                // in a click train
                numClicks += 1;
            }
            else {
                // new click train
                numClicks = 1;
                gd._mouseDownTime = newMouseDownTime;
            }

            if(options.prepFn) options.prepFn(e, startX, startY);

            dragCover = coverSlip();

            dragCover.onmousemove = onMove;
            dragCover.onmouseup = onDone;
            dragCover.onmouseout = onDone;

            return Plotly.Lib.pauseEvent(e);
        }

        function onMove(e) {
            var dx = e.clientX - startX,
                dy = e.clientY - startY;
            if(Math.abs(dx)<fx.MINDRAG) dx = 0;
            if(Math.abs(dy)<fx.MINDRAG) dy = 0;
            if(dx||dy) gd._dragged = true;

            if(options.moveFn) options.moveFn(dx, dy, gd._dragged);

            return Plotly.Lib.pauseEvent(e);
        }

        function onDone(e) {
            dragCover.onmousemove = null;
            dragCover.onmouseup = null;
            dragCover.onmouseout = null;
            if(dragCover.parentNode) {
                dragCover.parentNode.removeChild(dragCover);
            }

            if(!gd._dragging) return;
            gd._dragging = false;

            // don't count as a dblClick unless the mouseUp is also within
            // the dblclick delay
            if((new Date()).getTime() - gd._mouseDownTime > fx.DBLCLICKDELAY) {
                numClicks = Math.max(numClicks - 1, 1);
            }

            if(options.doneFn) options.doneFn(gd._dragged, numClicks);

            if(!gd._dragged) {
                var e2 = document.createEvent('MouseEvents');
                e2.initEvent('click', true, true);
                initialTarget.dispatchEvent(e2);
            }

            finishDrag(gd);

            return Plotly.Lib.pauseEvent(e);
        }

        options.element.onmousedown = onStart;
    };

    function coverSlip() {
        var cover = document.createElement('div');

        cover.className = 'dragcover';
        var cStyle = cover.style;
        cStyle.position = 'fixed';
        cStyle.left = 0;
        cStyle.right = 0;
        cStyle.top = 0;
        cStyle.bottom = 0;
        cStyle['z-index'] = 999999999;
        cStyle.background = 'none';

        document.body.appendChild(cover);

        return cover;
    }

    fx.setCursor = function(el3,csr) {
        (el3.attr('class')||'').split(' ').forEach(function(cls){
            if(cls.indexOf('cursor-')===0) { el3.classed(cls,false); }
        });
        if(csr) { el3.classed('cursor-'+csr, true); }
    };

    // convert text in an input to equivalently displayed html
    function escaped(val) {
        return val.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\s/g, '&nbsp;');
    }

    // function to combine two colors into one apparent color
    // if back has transparency or is missing, white is assumed behind it
    function combineColors(front,back){
        var fc = tinycolor(front).toRgb(),
            bc = tinycolor(back||'#FFF').toRgb();
        if(fc.a===1) return tinycolor(front).toRgbString();

        var bcflat = bc.a===1 ? bc : {
            r:255*(1-bc.a) + bc.r*bc.a,
            g:255*(1-bc.a) + bc.g*bc.a,
            b:255*(1-bc.a) + bc.b*bc.a
        };
        var fcflat = {
            r:bcflat.r*(1-fc.a) + fc.r*fc.a,
            g:bcflat.g*(1-fc.a) + fc.g*fc.a,
            b:bcflat.b*(1-fc.a) + fc.b*fc.a
        };
        return tinycolor(fcflat).toRgbString();
    }

    // for bar charts and others with finite-size objects: you must be inside
    // it to see its hover info, so distance is infinite outside.
    // But make distance inside be at least 1/4 MAXDIST, and a little bigger
    // for bigger bars, to prioritize scatter and smaller bars over big bars

    // note that for closest mode, two inbox's will get added in quadrature
    // args are (signed) difference from the two opposite edges
    // count one edge as in, so that over continuous ranges you never get a gap
    fx.inbox = function(v0,v1){
        if(v0*v1<0 || v0===0) {
            return fx.MAXDIST*(0.6-0.3/Math.max(3,Math.abs(v0-v1)));
        }
        return Infinity;
    };

    return fx;
}));
'use strict';

var Plotly = require('../../plotly');
var Plots = require('../../plots/plots');
var Lib = require('../../lib');

module.exports = function setPositions(gd, plotinfo) {
    var fullLayout = gd._fullLayout,
        xa = plotinfo.x(),
        ya = plotinfo.y(),
        orientations = ['v', 'h'],
        posAxis, i, j, k;

    for (i=0; i < orientations.length; ++i) {
        var orientation = orientations[i],
            boxlist = [],
            boxpointlist = [],
            minPad = 0,
            maxPad = 0,
            cd,
            t,
            trace;

        // set axis via orientation
        if (orientation==='h') posAxis = ya;
        else posAxis = xa;

        // make list of boxes
        for (j=0; j < gd.calcdata.length; ++j) {
            cd = gd.calcdata[j];
            t = cd[0].t;
            trace = cd[0].trace;

            if (trace.visible === true && Plots.traceIs(trace, 'box') &&
                    !t.emptybox &&
                    trace.orientation === orientation &&
                    trace.xaxis === xa._id &&
                    trace.yaxis === ya._id) {
                boxlist.push(j);
                if (trace.boxpoints !== false) {
                    minPad = Math.max(minPad, trace.jitter-trace.pointpos-1);
                    maxPad = Math.max(maxPad, trace.jitter+trace.pointpos-1);
                }
            }
        }

        // make list of box points
        for (j = 0; j < boxlist.length; j++) {
            cd = gd.calcdata[boxlist[j]];
            for (k = 0; k < cd.length; k++) boxpointlist.push(cd[k].pos);
        }
        if (!boxpointlist.length) continue;

        // box plots - update dPos based on multiple traces
        // and then use for posAxis autorange

        var boxdv = Lib.distinctVals(boxpointlist),
            dPos = boxdv.minDiff/2;

        // if there's no duplication of x points,
        // disable 'group' mode by setting numboxes=1
        if(boxpointlist.length===boxdv.vals.length) gd.numboxes = 1;

        // check for forced minimum dtick
        Plotly.Axes.minDtick(posAxis, boxdv.minDiff, boxdv.vals[0], true);

        // set the width of all boxes
        for (i=0; i < boxlist.length; ++i) {
            gd.calcdata[i][0].t.dPos = dPos;
        }

        // autoscale the x axis - including space for points if they're off the side
        // TODO: this will overdo it if the outermost boxes don't have
        // their points as far out as the other boxes
        var padfactor = (1-fullLayout.boxgap) * (1-fullLayout.boxgroupgap) *
                dPos / gd.numboxes;
        Plotly.Axes.expand(posAxis, boxdv.vals, {
            vpadminus: dPos+minPad*padfactor,
            vpadplus: dPos+maxPad*padfactor
        });
    }
};

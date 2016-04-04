'use strict'
var stream = Rx.Observable;

var imageSubject = new Rx.ReplaySubject();
var domSubject = new Rx.ReplaySubject(1);

var height = 400;
var number_of_images = 500;
var images_directory = 'images-300px';

var defaultHeight = height;

var formatter = d3.format('04d');

var zoomHandler = d3.behavior.zoom()
  .scaleExtent([0, 1]);

var zoomEvent$ = domSubject
  .map(function(s) {
    zoomHandler(s);
    return zoomHandler;
  })
  .flatMap(observableFromD3Event('zoom'))
  .pluck('event')
  .shareReplay();

var zoomScale$ = zoomEvent$
  .pluck('scale')
  .startWith(1);

var zoomTranslate$ = zoomEvent$
  .pluck('translate', '0')
  .startWith(0);

var images$ = stream
  .range(1, number_of_images)
  .map(function(n) { return `ALL${formatter(n)}` })
  .flatMap(function(name, index) { 
    return stream.timer(100 * index).map(d => name);
  })
  .map(function(name) {
    var scopedDom = domSubject
      .map(d => d.select(`.scope-${name}`))
      .first()
      .shareReplay();

    var loaded$ = scopedDom
      .flatMap(observableFromD3Event('load'))
      .map(o => ({
        imageWidth: o.node.width,
        display: 'inherit'
      }))
      .map(obj => memo => {
        return Object.assign(memo, obj);
      });

    return stream
      .merge(
        loaded$
      )
      .startWith({
        name,
        height: defaultHeight,
        imageWidth: 0,
        width: 0,
        left: 0,
        offset: 0,
        display: 'none'
      })
      .scan(apply)
  })
  .scan(function (a,b) {
    return a.concat(b);
  }, [])
  .flatMap(list => {
    return stream.combineLatest(list);
  })
  .combineLatest(
    zoomScale$,
    (arr, scale) => arr.map(d => { d.width = d.imageWidth * scale; return d })
  )
  .combineLatest(
    zoomTranslate$,
    (arr, trans) => arr.map(d => { d.left = d.offset + trans; return d })
  )
  .map(arr => {
    return arr
      .map((d, i, arr) => {
        if (i === 0) return d;
        var last = arr[i-1];
        d.offset = last.offset + last.width;
        return d;
      })
  });

var size$ = observableFromD3Event('resize')(d3.select(window))
  .pluck('node')
  .startWith(window)
  .map((o) => ({
    width: o.innerWidth,
    height: o.innerHeight
  }))

/**
 * DRIVER
 */

var app = d3
  .select('body')
  .style('margin', 0)
  .select('#app')
  .style({
    height: `${height}px`,
    border: '1px solid black',
    position: 'relative'
  })

var dom_reducer$ = images$
  .combineLatest(
    size$,
    (images, size) => ({ images, size })
  )
  .map(model => dom => {
    dom
      .style('width', `${model.size.width}px`)
      .style('height', `${model.size.height}px`)
      .style('background-color', 'black')

    var frame = dom
      .selectAll('.frame')
      .data([model]);

    frame
      .enter()
      .append('div')
      .classed('frame', true)
      .style('position', 'absolute')

    frame
      .style('top', `${(model.size.height/2) - (defaultHeight/2)}px`)

    let image = frame
      .selectAll('img')
      .data(d => d.images, d => d.name);

    image
      .enter()
      .append('img')
      .attr('src', d=> `${images_directory}/${d.name}.jpg`)
      .attr('class', d => `scope-${d.name}`)

    image
      .style({
        height: d => `${d.height}px`,
        left: d => `${d.left}px`,
        top: d => `${d.top}px`,
        position: 'absolute',
        display: d => d.display
      })
      .each(function(d) {
        if (d.width > 0)
          d3.select(this).style('width', `${d.width}px`)
      })

    return dom;
  });

var dom$ = dom_reducer$
  .scan(apply, app)

dom$.subscribe(domSubject.asObserver());

function apply(o, fn) { return fn(o); }

function log() {
  console.log.apply(console, arguments)
}

function observableFromD3Event(type) {
  return function(selection) {
    return stream
      .create(observer =>
        selection.on(type, function(d) {
          observer.onNext({
            datum: d,
            node: this,
            event: d3.event
          });
        })
      );
  };
}

/* global d3, Rx */
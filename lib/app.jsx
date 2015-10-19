var React            = require('react');
var NoteList         = require('./note_list.jsx');
var NoteEditor       = require('./note_editor.jsx');
var TagMenu          = require('./tag_menu.jsx');
var SearchField      = require('./search_field.jsx');
var NavigationBar    = require('./navigation_bar.jsx');
var Auth             = require('./auth.jsx');
var PlusIcon         = require('./icons/plus.jsx');
var NoteDisplayMixin = require('./note_display_mixin.js');
const classNames     = require( 'classnames' );


module.exports = React.createClass({

	mixins: [NoteDisplayMixin],

  getDefaultProps: function() {
    return {
      onAuthenticate: () => {},
      onSignOut: () => {}
    };
  },

  getInitialState: function() {
    return {
      notes: [],
      tags: [],
      showTrash: false,
      listTitle: "All Notes",
      authorized: this.props.client.isAuthorized()
    };
  },

  componentDidMount: function() {

		window.addEventListener('popstate', this._onPopState);

    this.props.notes
      .on('index', this.onNotesIndex)
      .on('update', this.onNoteUpdate)
      .on('remove', this.onNoteRemoved);

    this.props.tags
      .on('index', this.onTagsIndex)
      .on('update', this.onTagsIndex);

    this.props.client
      .on('authorized', this.onAuthChanged)
      .on('unauthorized', this.onAuthChanged);

    this.onNotesIndex();
    
  },

	_onPopState: function(event) {
		var state = event.state;
		// todo: retrieve the note and display it
		if (state) {
			this.props.notes.get(state.id, this._onGetNote);
		} else {
			this.setState({note: null});
		}
	},

	_onAddNote: function(e, note) {
		this.onNotesIndex();
		this.setState({note: note});
	},

	_onGetNote: function(e, note) {
		this.setState({note: note});
	},

  _closeNote: function() {
		this.replaceState(null, "Simplenote", "/");
    this.setState({note: null});
  },

  onAuthChanged: function() {
    var authorized = this.props.client.isAuthorized();
    this.setState({authorized: authorized})
    if (!authorized) {
      this.setState({notes: [], tags: []});
    }
  },

  onSelectNote: function(note) {
		var details = this.noteTitleAndPreview(note);
		window.history.pushState({id: note.id}, details.title != "" ? details.title : 'Untitled', '/' + note.id);
    this.setState({note: note, revisions: null});
  },

  onNotesIndex: function() {
    var done = this.onFindNotes;
    this.props.notes.query(function(db) {
      var notes = [];
      db.transaction('note').objectStore('note').index('pinned-sort').openCursor(null, 'prev').onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) {
          notes.push(cursor.value);
          cursor.continue();
        } else {
          done(null, notes);
        }
      };
    });
  },

  onNoteRemoved: function() {
    this.onNotesIndex();
  },

	onNewNote: function() {
		// insert a new note into the store and select it
		var ts = (new Date()).getTime()/1000;
		this.props.notes.add({
			content: "",
			deleted: false,
			systemTags: [],
			creationDate: ts,
			modificationDate: ts,
			shareURL: "",
			publishURL: "",
			tags: []
		}, this._onAddNote);
	},

  onNoteUpdate: function(id, data, original, patch) {

    this.onNotesIndex();
    if (this.state.note && id == this.state.note.id) {
      var note = this.state.note;

      console.log("Update cursor location and do conflict resolution?");

      // TODO: conflict resolution of the note and update the correct
      // cursor location.
      note.data = data;
      this.setState({note: note, patch: patch});
    }
  },

  onFindNotes: function(e, notes) {
    this.setState({notes: notes});
  },

  onTagsIndex: function() {
  },

  onClickTagFilter: function(tag) {
    console.log("Filter", tag);
  },

  onSearch: function(v) {
    this.setState({filter: v});
  },

  filterNotes: function() {
    var query = this.state.filter,
        trash = this.state.showTrash,
        notes = this.state.notes || [],
        filter = (note) => { return trash || !note.data.deleted };

    if (query) {
      var reg = new RegExp(query, 'gi');
      filter = and(filter, function(note){
        if (note.data && note.data.content) return reg.test(note.data.content);
        return false;
      });
    }

    return notes.filter(filter);
  },

  onUpdateContent: function(note, content) {
    if (note) {
      note.data.content = content;
      this.setState({note: note});

      var commit = (function() {
        this.props.notes.update(note.id, note.data);
      }).bind(this);

      throttle(note.id, commit);
    }
  },

  onUpdateTags: function(note, tags) {
    if (note) {
      note.data.tags = tags;
      this.props.notes.update(note.id, note.data);
      this.setState({note: note});
    }
  },

  onTrashNote: function(note) {
    if (note) {
      note.data.deleted = true;
      this.props.notes.update(note.id, note.data);
      this.setState({note: null});
    }
  },

  onRestoreNote: function(note) {
    if (note) {
      note.data.deleted = false;
      this.props.notes.update(note.id, note.data);
      this.setState({note: null});
    }
  },

  onRevisions: function(note) {
    this.props.notes.getRevisions(note.id, this._loadRevisions);
  },

  _loadRevisions: function(e, revisions) {
    if (e) return console.warn("Failed to load revisions", e);
    this.setState({revisions: revisions});
  },

  authorized: function(fn) {
    if (this.state.authorized) return fn();
  },

  unauthorized: function(fn) {
    if (!this.state.authorized) return fn();
  },

  render: function() {

    var notes = this.filterNotes();
    var tags = this.tag
    var note = this.state.note;
    var revisions = this.state.revisions;

	var classes = classNames( {
		'simplenote-app': true,
		'note-open': this.state.note
	} );

    return (
      <div className="app">
        { this.authorized( () => {
          return (
            <div className={classes}>
              <div className="source-list">
                <div className="toolbar">
									<NavigationBar title={this.state.listTitle}>
						        <div className="button" tabIndex="-1" onClick={this.onNewNote}>
						        	<PlusIcon />
						        </div>
									</NavigationBar>
                </div>
                <div className="toolbar-compact">
                  <SearchField onSearch={this.onSearch} />
                </div>
                <div className="panel">
                  <NoteList ref="list" notes={notes} onSelectNote={this.onSelectNote} note={note} />
                </div>
              </div>
              <NoteEditor
                note={note}
                revisions={this.state.revisions}
                onSignOut={this.props.onSignOut}
                onUpdateContent={this.onUpdateContent}
                onUpdateTags={this.onUpdateTags}
                onTrashNote={this.onTrashNote}
                onRestoreNote={this.onRestoreNote}
                onRevisions={this.onRevisions}
                onCloseNote={this._closeNote} />
            </div>
          )
        }) }
        { this.unauthorized( () => {
          return <Auth onAuthenticate={this.props.onAuthenticate} />
        })}
      </div>
    )
  }
});

var timers = {};

function timer(id) {
  var t = timers[id];
  if (!t) timers[id] = { start: (new Date()).getTime(), id: -1 }; 
  return timers[id];
};

function clearTimer(id) {
  delete timers[id];
}

var maxTime = 3000;

function throttle(id, cb) {
  var t = timer(id),
      now = (new Date()).getTime(),
      ellapsed = now - t.start,
      perform = function() {
        var t = timer(id),
            now = (new Date()).getTime(),
            ellapsed = now - t.start;

        cb();
        clearTimer(id);
        console.log(id, "Fired after", ellapsed);
      };

  clearTimeout(timer.id);

  if (ellapsed > maxTime) return perform();

  timer.id = setTimeout(perform, maxTime);
}

function and(fn, fn2) {
  return function(o) {
    if (!fn(o)) return false;
    return fn2(o);
  };
}

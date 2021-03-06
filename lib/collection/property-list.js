var _ = require('../util').lodash,
    PropertyBase = require('./property-base').PropertyBase,

    __PARENT = '__parent',
    DEFAULT_INDEX_ATTR = 'id',
    DEFAULT_INDEXCASE_ATTR = false,

    PropertyList;

_.inherit((

    /**
     * @constructor
     *
     * @todo
     * - document stuff
     */
    PropertyList = function PostmanPropertyList (type, parent, populate) {
        // @todo add this test sometime later
        // if (!type) {
        //     throw new Error('postman-collection: cannot initialise a list without a type parameter');
        // }

        PropertyList.super_.call(this); // call super with appropriate options

        this.setParent(parent); // save reference to parent
        _.assign(this, /** @lends PropertyList.prototype */ {
            /**
             * @private
             * @type {Array}
             */
            members: this.members || [],

            /**
             * @private
             * @type {Object}
             */
            reference: this.reference || {},

            /**
             * @private
             * @type {Function}
             */
            Type: type
        });

        // if the type this list holds has its own index key, then use the same
        _.getOwn(type, '_postman_propertyIndexKey') && (this._postman_listIndexKey = type._postman_propertyIndexKey);

        // if the type has case sensitivity flags, set the same
        _.getOwn(type, '_postman_propertyIndexCaseInsensitive') && (this._postman_listIndexCaseInsensitive =
            type._postman_propertyIndexCaseInsensitive);

        // if the type allows multiple values, set the flag
        _.getOwn(type, '_postman_propertyAllowsMultipleValues') && (this._postman_propertyAllowsMultipleValues =
            type._postman_propertyAllowsMultipleValues);

        // prepopulate
        populate && this.populate(populate);
    }), PropertyBase);

_.assign(PropertyList.prototype, /** @lends PropertyList.prototype */ {

    /**
     * Indicates that this element contains a number of other elements.
     * @private
     */
    _postman_propertyIsList: true,

    /**
     * Holds the attribute to index this PropertyList by. Default: 'id'
     *
     * @private
     * @type {String}
     */
    _postman_listIndexKey: DEFAULT_INDEX_ATTR,

    /**
     * Holds the attribute whether indexing of this list is case sensitive or not
     *
     * @private
     * @type {String}
     */
    _postman_listIndexCaseInsensitive: DEFAULT_INDEXCASE_ATTR,

    /**
     * Insert an element at the end of this list. When a reference member specified via second parameter is found, the
     * member is inserted at an index before the reference member.
     *
     * @param {PropertyList.Type} item
     * @param {PropertyList.Type|String} [before]
     */
    insert: function (item, before) {
        if (!_.isObject(item)) { return; } // do not proceed on empty param

        var duplicate = this.indexOf(item),
            index;

        // remove from previous list
        PropertyList.isPropertyList(item[__PARENT]) && (item[__PARENT] !== this) && item[__PARENT].remove(item);
        // inject the parent reference
        _.assignHidden(item, __PARENT, this);

        // ensure that we do not double insert things into member array
        (duplicate > -1) && this.members.splice(duplicate, 1);
        // find the position of the reference element
        before && (before = this.indexOf(before));

        // inject to the members array ata position or at the end in case no item is there for reference
        (before > -1) ? this.members.splice(before, 0, item) : this.members.push(item);

        // store reference by id, so create the index string. we first ensure that the index value is truthy and then
        // recheck that the string conversion of the same is truthy as well.
        if ((index = item[this._postman_listIndexKey]) && (index = String(index))) {
            // desensitise case, if the property needs it to be
            this._postman_listIndexCaseInsensitive && (index = index.toLowerCase());

            // if multiple values are allowed, the reference may contain an array of items, mapped to an index.
            if (this._postman_propertyAllowsMultipleValues && this.reference.hasOwnProperty(index)) {

                // if the value is not an array, convert it to an array.
                !_.isArray(this.reference[index]) && (this.reference[index] = [this.reference[index]]);

                // add the item to the array of items corresponding to this index
                this.reference[index].push(item);
            }
            else {
                this.reference[index] = item;
            }
        }
    },

    /**
     * Insert an element at the end of this list. When a reference member specified via second parameter is found, the
     * member is inserted at an index after the reference member.
     *
     * @param {PropertyList.Type} item
     * @param {PropertyList.Type|String} [after]
     */
    insertAfter: function (item, after) {
        // convert item to positional reference
        return this.insert(item, this.idx(this.indexOf(after) + 1));
    },

    /**
     * Adds or moves an item to the end of this list
     * @param {PropertyList.Type} item
     */
    append: function (item) {
        return this.insert(item);
    },

    /**
     * Adds or moves an item to the beginning of this list
     * @param {PropertyList.Type} item
     */
    prepend: function (item) {
        return this.insert(item, this.idx(0));
    },

    /**
     * Add an item or item definition to this list
     * @param {Object|PropertyList.Type} item
     *
     * @todo
     * - remove item from original parent if already it has a parent
     * - validate that the original parent's constructor matches this parent's constructor
     */
    add: function (item) {
        // do not proceed on empty param, but empty strings are in fact valid.
        if (_.isNull(item) || _.isUndefined(item) || _.isNaN(item)) { return; }

        // create new instance of the item based on the type specified if it is not already
        this.insert((item.constructor === this.Type) ? item :
            // if the property has a create static function, use it.
            // eslint-disable-next-line prefer-spread
            (_.has(this.Type, 'create') ? this.Type.create.apply(this.Type, arguments) : new this.Type(item)));
    },

    /**
     * Removes all elements from the PropertyList for which the predicate returns truthy.
     * @param predicate {Function|String|Type}
     * @param context {Object} Optional context to bind the predicate to.
     */
    remove: function (predicate, context) {
        var match; // to be used if predicate is an ID

        !context && (context = this);

        // if predicate is id, then create a function to remove that from array
        if (_.isString(predicate)) {
            (match = this.one(predicate)) && (predicate = function (item) {
                return (item === match);
            });
        }
        // in case an object reference is sent, prepare it for removal
        else if (predicate instanceof this.Type) {
            match = predicate;
            predicate = function (item) {
                return (item === match);
            };
        }

        _.isFunction(predicate) && _.remove(this.members, function (item) {
            var index;
            if (predicate.apply(context, arguments)) {
                if ((index = item[this._postman_listIndexKey]) && (index = String(index))) {
                    this._postman_listIndexCaseInsensitive && (index = index.toLowerCase());
                    delete this.reference[index];
                }
                delete item[__PARENT]; // unlink from its parent
                return true;
            }
        }.bind(this));
    },

    /**
     * Removes all items in the list
     */
    clear: function () {
        // we unlink every member from it's parent (assuming this is their parent)
        this.all().forEach(PropertyList._unlinkItemFromParent);

        this.members.length = 0; // remove all items from list

        // now we remove all items from index reference
        Object.keys(this.reference).forEach(function (key) {
            delete this.reference[key];
        }.bind(this));
    },

    /**
     * Load one or more items
     *
     * @param {Object|Array} items
     */
    populate: function (items) {
        // if Type supports parsing of string headers then do it before adding it.
        _.isString(items) && _.isFunction(this.Type.parse) && (items = this.Type.parse(items));
        // add a single item or an array of items.
        _.forEach(_.isArray(items) ? items :
            // if population is not an array, we send this as single item in an array or send each property separately
            // if the core Type supports Type.create
            ((_.isPlainObject(items) && _.has(this.Type, 'create')) ? items : [items]), this.add.bind(this));
    },

    /**
     * Clears the list and adds new items.
     *
     * @param {Object|Array} items
     */
    repopulate: function (items) {
        this.clear();
        this.populate(items);
    },

    /**
     * Returns a map of all items
     * @returns {Object}
     */
    all: function () {
        return _.clone(this.members);
    },

    /**
     * Get Item in this list by `ID` reference. If multiple values are allowed, the last value is returned.
     *
     * @param {String} id
     * @returns {PropertyList.Type}
     */
    one: function (id) {
        var val = this.reference[this._postman_listIndexCaseInsensitive ? String(id).toLowerCase() : id];

        if (this._postman_propertyAllowsMultipleValues && Array.isArray(val)) {
            return val.length ? val[val.length - 1] : undefined;
        }

        return val;
    },

    /**
     * Get the value of an item in this list. This is similar to {@link PropertyList.one} barring the fact that it
     * returns the value of the underlying type of the list content instead of the item itself.
     *
     * @param {String|Function} key
     * @returns {PropertyList.Type}
     */
    get: function (key) {
        var member = this.one(key);
        if (!member) { return; }

        return member.valueOf();
    },

    /**
     * Iterate on each item of this list
     */
    each: function (iterator, context) {
        _.forEach(this.members, _.isFunction(iterator) ? iterator.bind(context || this.__parent) : iterator);
    },

    /**
     * @param {Function} rule
     */
    filter: function (rule, context) {
        return _.filter(this.members, _.isFunction(rule) && _.isObject(context) ? rule.bind(context) : rule);
    },

    /**
     * Find an item within the item group
     *
     * @param {Function} rule
     * @param {Object} [context]
     * @returns {Item|ItemGroup}
     */
    find: function (rule, context) {
        return _.find(this.members, _.isFunction(rule) && _.isObject(context) ? rule.bind(context) : rule);
    },

    /**
     * Iterates over the property list.
     *
     * @param iterator {Function} Function to call on each item.
     * @param context Optional context, defaults to the PropertyList itself.
     */
    map: function (iterator, context) {
        return _.map(this.members, _.isFunction(iterator) ? iterator.bind(context || this) : iterator);
    },

    /**
     * Returns the length of the PropertyList
     *
     * @returns {Number}
     */
    count: function () {
        return this.members.length;
    },

    /**
     * Get a member of this list by it's index
     *
     * @param {Number} index
     * @returns {PropertyList.Type}
     */
    idx: function (index) {
        return this.members[index];
    },

    /**
     * Find the index of an item in this list
     *
     * @param {String|Object} item
     * @returns {Number}
     */
    indexOf: function (item) {
        return this.members.indexOf(_.isString(item) ? (item = this.one(item)) : item);
    },

    /**
     * Check whether an item exists in this list
     *
     * @param {String|PropertyList.Type} item
     * @param {*=} value
     * @returns {Boolean}
     */
    has: function (item, value) {
        var match,
            val,
            i;

        match = _.isString(item) ?
            this.reference[this._postman_listIndexCaseInsensitive ? item.toLowerCase() : item] :
            this.filter(function (member) {
                return member === item;
            });

        // If we don't have a match, there's nothing to do
        if (!match) { return false; }

        // if no value is provided, just check if item exists
        if (arguments.length === 1) {
            return Boolean(_.isArray(match) ? match.length : match);
        }

        // If this property allows multiple values and we get an array, we need to iterate through it and see
        // if any element matches.
        if (this._postman_propertyAllowsMultipleValues && _.isArray(match)) {
            for (i = 0; i < match.length; i++) {

                // use the value of the current element
                val = _.isFunction(match[i].valueOf) ? match[i].valueOf() : match[i];

                if (val === value) { return true; }
            }

            // no matches were found, so return false here.
            return false;
        }

        // We didn't have an array, so just check if the matched value equals the provided value.
        _.isFunction(match.valueOf) && (match = match.valueOf());

        return match === value;
    },

    /**
     * Iterates over all parents of the property list
     *
     * @param {Function} iterator
     * @param {Object=} [context]
     */
    eachParent: function (iterator, context) {
        // validate parameters
        if (!_.isFunction(iterator)) { return; }
        !context && (context = this);

        var parent = this.__parent,
            prev;

        // iterate till there is no parent
        while (parent) {
            // call iterator with the parent and previous parent
            iterator.call(context, parent, prev);

            // update references
            prev = parent;
            parent = parent.__parent;
        }
    },

    /**
     * Converts a list of Properties into an object where key is `_postman_propertyIndexKey` and value is determined
     * by the `valueOf` function
     *
     * @return {Object}
     */
    toObject: function (excludeDisabled, caseSensitive) {
        var obj = {},
            key = this._postman_listIndexKey;

        if (caseSensitive) {
            this.each(function (member) {
                if (!member.hasOwnProperty(key)) { return; }
                if (excludeDisabled && member.disabled) { return; }

                obj[member[key]] = member.valueOf();
            });
        }
        else {
            _.forOwn(this.reference, function (member, prop) {
                _.isArray(member) && (member = _.last(member));
                if (excludeDisabled && member.disabled) { // do no process disabled objects
                    return;
                }

                obj[prop] = member.valueOf();
            });
        }

        return obj;
    },

    /**
     * Adds ability to convert a list to a string provided it's underlying format has unparse function defined
     * @return {String}
     */
    toString: function () {
        if (this.Type.unparse) {
            return this.Type.unparse(this.members);
        }

        return this.constructor ? this.constructor.prototype.toString.call(this) : '';
    },

    toJSON: function () {
        if (!this.count()) {
            return [];
        }

        return _.map(this.members, function (member) {
            // use member.toJSON if it exists
            if (!_.isEmpty(member) && _.isFunction(member.toJSON)) {
                return member.toJSON();
            }

            return _.reduce(member, function (accumulator, value, key) {
                if (value === undefined) { // true/false/null need to be preserved.
                    return accumulator;
                }

                // Handle plurality of PropertyLists in the SDK vs the exported JSON.
                // Basically, removes the trailing "s" from key if the value is a property list.
                if (value && value._postman_propertyIsList && !value._postman_proprtyIsSerialisedAsPlural && _.endsWith(key, 's')) {
                    key = key.slice(0, -1);
                }

                // Handle 'PropertyBase's
                if (value && _.isFunction(value.toJSON)) {
                    accumulator[key] = value.toJSON();
                    return accumulator;
                }

                // Handle Strings
                if (_.isString(value)) {
                    accumulator[key] = value;
                    return accumulator;
                }

                // Everything else
                accumulator[key] = _.cloneElement(value);
                return accumulator;
            }, {});
        });
    }
});

_.assign(PropertyList, /** @lends PropertyList */ {
    /**
     * Defines the name of this property for internal use.
     * @private
     * @readOnly
     * @type {String}
     */
    _postman_propertyName: 'PropertyList',

    /**
     * Removes child-parent links for the provided PropertyList member.
     *
     * @param {Property} item - The property for which to perform parent de-linking.
     * @private
     */
    _unlinkItemFromParent: function (item) {
        item.__parent && (delete item.__parent); // prevents V8 from making unnecessary look-ups if there is no __parent
    },

    /**
     * Checks whether an object is a PropertyList
     *
     * @param {*} obj
     * @returns {Boolean}
     */
    isPropertyList: function (obj) {
        return Boolean(obj) && ((obj instanceof PropertyList) ||
            _.inSuperChain(obj.constructor, '_postman_propertyName', PropertyList._postman_propertyName));
    }
});

module.exports = {
    PropertyList: PropertyList
};

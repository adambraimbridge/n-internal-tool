'use strict';

const fs = require('fs');
const path = require('path');
const promisify = require('util').promisify;

const readdirAsync = promisify(fs.readdir);
const lstatAsync = promisify(fs.lstat);
const realpathAsync = promisify(fs.realpath);
const exists = promisify(fs.exists, function (doesExists) { return [undefined, doesExists]; });

const flatten = function (list) {
	return list.reduce(function (acc, it) {
		return acc.concat(it);
	}, []);
};

const itemsWithStats = function (directory, limitToComponents) {
	return exists(directory)
		.then(function (exists) {
			if (!exists) return [];
			return readdirAsync(directory)
				.then(function (files) {
					if (limitToComponents) {
						files = files.filter((f) => limitToComponents.indexOf(f) > -1);
					}
					const stats = files.map(function (file) {
						const fullPath = path.join(directory, file);

						return lstatAsync(fullPath)
							.then(function (stat) {
								return {name: file, path: fullPath, stat: stat};
							});
					});

					return Promise.all(stats);
				});
		});
};

const classifyItems = function (items, otherPaths) {
	return ({
		directories: items
			.filter(function (it) { return it.stat.isDirectory(); })
			.concat(otherPaths)
			.map(function (it) { return { name: it.path || it, path: it.path || it }; }),

		links: items
			.filter(function (it) { return it.stat.isSymbolicLink(); })
			.map(function (it) { return it.path; })
	});
};

const selectValidLinkedPaths = function (linkedItems, ignores, linkPath) {
	return linkedItems
		.filter(function (item) { return ignores.indexOf(item.name) < 0 && item.stat.isDirectory(); })
		.map(function (item) { return { name: path.join(linkPath, item.name), path: item.path }; });
};

const itemNamespace = function (name, bowerRoot) {
	const namespace = name.replace(bowerRoot, '');
	if(namespace === name)
		return '';

	return namespace;
};

// exports

const loadPartials = function (ehInstance, bowerRoot, otherPaths, ignores, limitToComponents) {
	// Get files in bowerRoot
	return itemsWithStats(bowerRoot, limitToComponents)
		.then(function (items) {
			items = classifyItems(items, otherPaths);

			return Promise.all(items.links
				.map(function (link) {
					return realpathAsync(link)
						.then(function (linkedPath) {
							return itemsWithStats(linkedPath);
						})
						.then(function (it) {
							return selectValidLinkedPaths(it, ignores, link);
						});
				})
			)
				.then(function (paths) {
					return items.directories.concat(flatten(paths));
				});
		})
		.then(function (directories) {
			return Promise.all(directories.map(function (dir) {
				const namespace = itemNamespace(dir.name, bowerRoot);

				return ehInstance.getTemplates(dir.path)
					.then(function (templates) {
						return ({
							templates: templates,
							namespace: namespace
						});
					});
			}));
		});
};

module.exports = loadPartials;

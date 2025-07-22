#!/bin/bash
cp firestore.rules.backup firestore.rules
sed -i '' 's/function hasClaim(role) {/function hasClaim(role) {\n      return request.auth != null \&\& request.auth.token != null \&\& request.auth.token[role] == true;\n    }\n    function hasAdminAccess() {\n      return request.auth != null \&\& request.auth.token != null \&\& \n             (request.auth.token.admin == true \|\| request.auth.token.super_admin == true);\n    }\n    function hasSuperAdminAccess() {\n      return request.auth != null \&\& request.auth.token != null \&\& request.auth.token.super_admin == true;\n    }/' firestore.rules
perl -pi -e "s/hasClaim\('admin'\)/hasAdminAccess()/g" firestore.rules
perl -pi -e "s/request\.auth\.token\.admin == true/hasAdminAccess()/g" firestore.rules

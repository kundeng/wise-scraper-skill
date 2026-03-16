# Splunk ITSI 4.21 — Administer Manual

> Extracted on 2026-03-15
> Source: https://help.splunk.com/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/
> Pages: 3

## Table of Contents

1. [About administering IT Service Intelligence](#about-administering-it-service-intelligence)
2. [Configure users and roles in ITSI](#configure-users-and-roles-in-itsi)
3. [Create a custom role in ITSI](#create-a-custom-role-in-itsi)

---

# About administering IT Service Intelligence

> Source: https://help.splunk.com/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/overview/about-administering-it-service-intelligence

Splunk IT Service Intelligence (ITSI) is a scalable IT monitoring and analytics solution that provides actionable insight into the performance and behavior of your IT operations. This manual covers the tasks of administering an ITSI deployment, including configuring users and roles, scheduling maintenance windows, and backing up your ITSI environment.
The following tables describes the tasks involved in administering an ITSI deployment:
| Name | Description |
| --- | --- |
| Configure users and roles | Add users, assign users to roles, and assign those roles custom capabilities to provide granular, role-based access control for your organization. |
| Manage teams | Create teams to restrict service-level information to certain departments or organizations. |
| Schedule maintenance downtime | Set up maintenance windows to prevent alerts from triggering from machines and other devices that are undergoing maintenance operations or don't require active monitoring. |
| Back up and restore ITSI KV store data | Regularly back up the KV store and restore your ITSI data from a backup in the event of a disaster or if you add a search head to a cluster. You can perform both full backups and partial backups of your data. |
Admins are also responsible for ingesting and analyzing entities, creating services and KPIs, and setting up alerts. These tasks are covered in the following manuals:
- For information about importing entities and setting up entity integrations, see the *[Entity Integrations Manual](/?resourceId=ITSI_Entity_About)*.
- For information about setting up services and defining KPIs, see the *[Service Insights Manual](/?resourceId=ITSI_SI_AboutSI)*.
- For information about aggregating notable events and setting up alert actions, see the *[Event Analytics Manual](/?resourceId=ITSI_EA_AboutEA)*.
## See also
- For new features and bugs fixes, see the ITSI *[Release Notes](/?resourceId=ITSI_ReleaseNotes_Newfeatures)*.
- For information about installing and upgrading ITSI, see the *[Install and Upgrade Manual](/?resourceId=ITSI_Install_About)*.

---

# Configure users and roles in ITSI

> Source: https://help.splunk.com/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/permissions/configure-users-and-roles-in-itsi

Splunk IT Service Intelligence (ITSI) uses the access control system integrated with the Splunk platform. The Splunk platform authorization allows you to add users, assign users to [roles](https://docs.splunk.com/Splexicon:Role), and assign those roles custom [capabilities](https://docs.splunk.com/Splexicon:Capability) to provide granular, role-based access control for your organization.
CAUTION: Never delete the default `admin` user from your Splunk instance. The admin user is necessary for many IT Service Intelligence features, such as notable event grouping in Episode Review. For more information about users, see [About user authentication](/?resourceId=Splunk_Security_SetupuserauthenticationwithSplunk) in the *Securing Splunk Enterprise* manual.
## Overview of ITSI roles
Splunk IT Service Intelligence provides four default roles with predefined capabilities:
| Role | Description |
| --- | --- |
| `itoa_user` | Assign this role to users who need basic read access to ITSI. |
| `itoa_analyst` | Assign this role to knowledge managers in your organization who will create glass tables, deep dives, and service analyzers and work with episodes in Episode Review. |
| `itoa_team_admin` | Create team admin roles that inherit from this role. Team admins can create and administer services, and update objects for ITSI teams to which they are assigned read/write access. This role can also create and manage notable event aggregation policies. |
| `itoa_admin` | Assign this role to ITSI administrators. Admins create teams for team administrators to administer as well as create objects in the Global team. This role is required to assign access to objects such as glass tables to other ITSI roles. Note that users with the Splunk `admin` role also have the `itoa_admin` role. |
Splunk Enterprise administrators can assign users to these roles to grant an appropriate level of access to specific ITSI functions. The role to which you assign a user depends on the specific tasks the user performs inside of ITSI, and level of security access that a user requires. Because this option is not available in Splunk Cloud Platform, you can instead use [use Splunk Web](/?resourceId=Splunk_Security_Addandeditroles) to create and manage roles.
You can also create custom roles. If your organization is planning to use teams to manage service-level permissions, you need to create custom roles that inherit from the provided ITSI roles. See [Create custom roles for teams](/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/permissions/configure-users-and-roles-in-itsi#ddde416b_9fd3_494d_bd12_0326cd7dfef9--en__Create_custom_roles_for_teams) for information.
## ITSI roles and capabilities
The following table summarizes ITSI roles, inheritance, and capabilities. The permissions listed below refer to user-level access through the REST API only, and do not apply to visibility or access in the user interface. For a full list of ITSI capabilities, see [ITSI capabilities reference](/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/permissions/itsi-capabilities-reference#d44ce594450394619a9680cc65b1eaa61--en__ITSI_capabilities_reference).
| Role | Inherits from role | Capabilities |
| --- | --- | --- |
| `itoa_user` | user, user_ad_user* | read services, KPIs, and entities
read service templates
read KPI base searches
read KPI threshold templates
read glass tables and write their own private glass tables
read the default Service Analyzer (homeview)
read deep dives
read/write/delete deep dives context (drilldown from Service Analyzer or notable events)
read correlation search
read/write/delete notable event management state
read notable events
read notable event actions
read team objects |
| `itoa_analyst` | itoa_user, user, power, user_ad_user* | All capabilities of itoa_user plus the following: 
read/write/delete glass tables
read/write/delete deep dives
read/write/delete saved service analyzers
read/write/delete notable events
read/execute notable event actions
read notable event aggregation policies
read/write/delete episode exports |
| `itoa_team_admin` | itoa_analyst, user, power, metric_ad_admin* | All capabilities of itoa_analyst plus the following: 
configure permissions
read/write/delete services, KPIs, and entities
read/write/delete KPI base searches
read/write/delete KPI threshold templates
read/write/delete correlation search
read/write/delete maintenance windows
read/write/delete modules
read/write/delete notable event aggregation policies
write/delete team objects
read/write/delete episode exports |
| `itoa_admin` | itoa_team_admin, user, power, metric_ad_admin* | All capabilities of itoa_team_admin plus the following: 
read/write/delete service templates
perform bulk import of entities and services via CSV/search
read/write/delete backups and restores
edit the default notable event aggregation policy
read/write/delete episode exports |
*The `user_ad_user` and `metric_ad_admin` roles are inherited by ITSI roles for the purposes of using anomaly detection in ITSI. Do not assign these roles to users separately.
ITSI role capabilities apply only to shared objects. Users assigned to the `itoa_user` role can create and manage private service analyzers, glass tables, and deep dives.
Note: If you have the `itoa_admin` or `itoa_team_admin` role, or the capabilities of these roles, you need write access to the Global team to write and delete global objects such as service templates, entities, KPI templates, base searches, and threshold templates.
## Splunk Admin capabilities and ITSI roles
Some ITSI roles inherit capabilities that are typically only available to Splunk administration roles.
The following table lists the capabilities and ITSI roles that have these capabilities:
| Capability | itoa_user | itoa_analyst | itoa_team_admin | itoa_admin |
| --- | --- | --- | --- | --- |
| edit_token_http | x | x | x | x |
| list_storage_passwords |  | x | x |  |
| list_search_head_clustering |  |  | x | x |
| dispatch_rest_to_indexers |  |  | x | x |
| list_settings |  |  | x |  |
| edit_monitor |  |  | x |  |
## Enable or disable ITSI capabilities for a role
You can enable or disable object capabilities for ITSI roles in [authorize.conf](/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/configuration-file-reference/authorize.conf#df22b7fbbe1ae458086375fd103d8141f--en__authorize.conf) in Splunk Enterprise. Because this option is not available in Splunk Cloud Platform, you can instead use [use Splunk Web](/?resourceId=Splunk_Security_Addandeditroles) to create and manage roles.
- Open or create a copy of `authorize.conf` in `$SPLUNK_HOME/etc/apps/itsi/local/` directory.
- In the local file, enable or disable the appropriate capabilities for ITSI-specific roles. To disable a capability, replace `enabled` with `disabled` or delete the capability from the file.
The following example shows a portion of the `authorize.conf` file with `read_itsi_glass_table = disabled` for `role_itoa_user`:
PYTHONCopy
## ITOA Admin
## The ITOA admin role inherits itoa_analyst;power;itoa_user;user roles
## This allows users assigned to the itoa_admin role to perform all capabilities of an itoa_team_admin, itoa_analyst and itoa_user
[role_itoa_admin]
importRoles = itoa_team_admin;power;user;metric_ad_admin

edit_itsi_modules_conf = enabled

## Core dependent capabilities
# Capabilities copied from Splunk admin role to enable write permissions
list_storage_passwords = enabled

# Add capability to lookup settings (regular and search head)
# Search head configuration is used by ITSI modular inputs
list_search_head_clustering = enabled
list_settings = enabled

rtsearch = enabled

# For event management
edit_token_http = enabled

## ITSI specific/controlled capabilities

# Notable Event Rules Engine
read_itsi_notable_aggregation_policy = enabled
write_itsi_notable_aggregation_policy = enabled
delete_itsi_notable_aggregation_policy = enabled
interact_with_itsi_notable_aggregation_policy = enabled
edit_default_itsi_notable_aggregation_policy = enabled

# Set Role Based Access Control
configure_perms = enabled

# Glass Table
read_itsi_glass_table = disabled
write_itsi_glass_table = disabled
delete_itsi_glass_table = disabled
interact_with_itsi_glass_table = disabled
```
## ITOA Admin
## The ITOA admin role inherits itoa_analyst;power;itoa_user;user roles
## This allows users assigned to the itoa_admin role to perform all capabilities of an itoa_team_admin, itoa_analyst and itoa_user
[role_itoa_admin]
importRoles = itoa_team_admin;power;user;metric_ad_admin

edit_itsi_modules_conf = enabled

## Core dependent capabilities
# Capabilities copied from Splunk admin role to enable write permissions
list_storage_passwords = enabled

# Add capability to lookup settings (regular and search head)
# Search head configuration is used by ITSI modular inputs
list_search_head_clustering = enabled
list_settings = enabled

rtsearch = enabled

# For event management
edit_token_http = enabled

## ITSI specific/controlled capabilities

# Notable Event Rules Engine
read_itsi_notable_aggregation_policy = enabled
write_itsi_notable_aggregation_policy = enabled
delete_itsi_notable_aggregation_policy = enabled
interact_with_itsi_notable_aggregation_policy = enabled
edit_default_itsi_notable_aggregation_policy = enabled

# Set Role Based Access Control
configure_perms = enabled

# Glass Table
read_itsi_glass_table = disabled
write_itsi_glass_table = disabled
delete_itsi_glass_table = disabled
interact_with_itsi_glass_table = disabled
```
## Create custom roles for teams
If you decide to create teams in ITSI to segment your service-level data, you must create custom roles that inherit from the standard ITSI roles. Then you can assign permissions to specific roles that correspond to specific teams. See [Implement teams in ITSI](/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/teams/create-teams-in-itsi#c1d1485f_02db_494e_867b_5b3785ec0f94--en__Create_teams_in_ITSI) for information about service-level permissions and teams.
Create a new custom role and configure the role to inherit from the `itoa_team_admin` role so it has the appropriate capabilities. Then assign users to each team admin role you created.
For example, the Splunk admin creates an `itoa_finance_admin` role to administer the Finance team. The role inherits from the `itoa_team_admin`. The Splunk admin then assigns the Finance team administrator to the `itoa_finance_admin` role.
The Finance team administrator can then create custom roles for the analysts and users on the Finance team. For example, create an `itoa_finance_analyst` role that inherits from the `itoa_analyst` role for the analysts in the Finance department. Likewise, create an `itoa_finance_user` role that inherits from the `itoa_user role` for the users in the Finance department.
The team administrator can then assign permissions to the Finance team for the `itoa_finance_analyst` and `itoa_finance_user` roles without allowing access to analysts and users from other departments.
Note: You must configure the `itoa_admin` role to inherit from the custom roles you create, otherwise the `itoa_admin` role cannot assign permissions to the custom roles. Alternatively, use the admin role to assign permissions.
For information about creating custom roles, see [About configuring role-based user access](/?resourceId=Splunk_Security_Aboutusersandroles) in the *Securing Splunk Enterprise* manual.
### Using teams in conjunction with other access controls
Teams provide a more granular level of access control than the roles provided with ITSI. Teams let you restrict read/write access to services and the KPIs associated with services within ITSI views such as glass tables, deep dives, and service analyzers.
For example, a user might have permission to view a particular glass table, but if a KPI in that glass table belongs to a service in a team for which the user does not have read permission, the KPI is not displayed. Only the data related to services for which the user has read access are displayed on the glass table.
To prevent users from being confronted with widgets they cannot view in glass tables or lanes they cannot view in deep dives, keep in mind the intended audience when creating a shared glass table or deep dive and create these visualizations for a particular team.
For example, if you are creating a glass table for the Finance team, create a shared glass table that only includes services and KPIs in the Finance team or Global team and assign read/write permissions for the glass table to the Finance team roles. Then users from other teams won't try to access the glass table and get frustrated when they can't view all of the information.
See [Overview of teams in ITSI](/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/teams/overview-of-teams-in-itsi#a5528e7f_a949_4137_8c7c_d5f658622061--en__Overview_of_teams_in_ITSI) for detailed information about service-level permissions and teams.

---

# Create a custom role in ITSI

> Source: https://help.splunk.com/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/permissions/create-a-custom-role-in-itsi

If you create a new role that does not inherit from one of the standard ITSI roles, you need to do four things to ensure the custom role has the appropriate level of access in ITSI:
- Assign the role proper capabilities.
- Grant the role access to ITSI indexes.
- Assign the role proper view-level access.
- Assign the role KV store collection level access.
For example, in order to assign a new role write permissions to a deep dive, that new role must first be assigned the `write_deep_dives` capability. The new role must also have write access to the `saved_deep_dives_lister` view, and write access to the `itsi_pages` collection.
## Step 1: Assign the role proper capabilities
The instructions cover enabling or disabling object capabilities for ITSI roles in [authorize.conf](/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/configuration-file-reference/authorize.conf#df22b7fbbe1ae458086375fd103d8141f--en__authorize.conf) in Splunk Enterprise. Because this option is not available in Splunk Cloud Platform, you can instead use [use Splunk Web](/?resourceId=Splunk_Security_Addandeditroles) to create and manage roles.
Prerequisites
- Only users with file system access, such as system administrators, can assign object capabilities using a configuration file.
- Review the steps in [How to edit a configuration file](/?resourceId=Splunk_Admin_Howtoeditaconfigurationfile) in the *Admin Manual*.
CAUTION: Never change or copy the configuration files in the `default` directory. The files in the `default` directory must remain intact and in their original location.
Steps
- Open or create a local copy of [authorize.conf](/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/configuration-file-reference/authorize.conf#df22b7fbbe1ae458086375fd103d8141f--en__authorize.conf) in `$SPLUNK_HOME/etc/apps/itsi/local/` directory.
- In the local file, enable or disable the appropriate capabilities for ITSI-specific roles. To disable a capability, replace `enabled` with `disabled` or delete the capability from the file. For an example, see [Enable or disable ITSI capabilities for a role](/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/permissions/configure-users-and-roles-in-itsi#id_60cf3a15_932a_4746_9401_3225260d4501--en__Enable_or_disable_ITSI_capabilities_for_a_role).
## Step 2: Grant the role access to ITSI indexes
By default, all ITSI-specific roles have access to ITSI indexes. If you create a custom role in ITSI, assign the role access to the ITSI indexes.
If you do not update the roles with the correct indexes, searches and other objects that rely on data from unassigned indexes do not update or display results.
- Click Settings > Roles (or Settings > Access controls > Roles on Splunk versions prior to 8.1.0)
- Open the custom role.
- Go to the Indexes tab.
- Check the box in the Included tab for each of the following indexes: 
`anomaly_detection`
- `itsi_grouped_alerts`
- `itsi_notable_archive`
- `itsi_notable_audit`
- `itsi_summary`
- `itsi_summary_metrics`
- `itsi_tracked_alerts`
- `snmptrapd` (optional, used only if you're collecting SNMP traps)
- Click Save.
- (Optional) Repeat for additional roles, as needed.
## Step 3: Assign the role proper view-level access
ITSI includes default entries in `itsi/metadata/default.meta` that determine access for ITSI roles to specific ITSI views. By default, only `itoa_admin` has read/write permissions for all ITSI views.
### Set permissions to ITSI views in Splunk Web
- In Splunk Web, go to Settings > All configurations.
- Set the App to IT Service Intelligence (itsi). Set the Owner to Any.
- Change Visible in the App to Created in the App to narrow the view to only ITSI objects.
- Filter by `views` to only display ITSI views.
- For a specific view, click Permissions in the Sharing column.
- Check the boxes to grant read and write permissions for ITSI roles.
- Click Save.
This action updates the access permissions to ITSI views for ITSI roles in `$SPLUNK_HOME/etc/apps/itsi/metadata/local.meta`.
### Set permissions to ITSI views from the command line
- Create a `local.meta` file in the `itsi/metadata/` directory.
CODECopy
cd $SPLUNK_HOME/etc/apps/itsi/metadata
cp default.meta local.meta
```
cd $SPLUNK_HOME/etc/apps/itsi/metadata
cp default.meta local.meta
```
- Edit `itsi/metadata/local.meta`.
- Set access for specific roles in `local.meta`. For example:
CODECopy
[views/glass_tables_lister]
access = read : [ itoa_admin, itoa_analyst, itoa_user ], write: [itoa_admin]
```
[views/glass_tables_lister]
access = read : [ itoa_admin, itoa_analyst, itoa_user ], write: [itoa_admin]
```
## Step 4: Assign the role KV store collection level access
The `SA-ITOA` file includes default entries in `metadata/default.meta` that determine access to KV store collections for ITSI roles. For a list of default permissions to KV store collections for ITSI roles, see [KV store collection permissions in ITSI](/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/permissions/kv-store-collection-permissions-in-itsi#d9517c0262eb54db9bc3a351cc34cb85c--en__KV_store_collection_permissions_in_ITSI). By default, only the `itoa_admin` role has read/write/delete access to all ITSI KV store collections.
### Set permissions to KV store collections in Splunk Web
- In Splunk Web, go to Settings > All configurations.
- Set the App to IT Service Intelligence (itsi). Set the Owner to Any.
- Make sure Visible in the App is selected.
- Filter by `collections-conf` to only display KV store collections.
- For a specific view, click Permissions in the Sharing column.
- Check the boxes to grant read and write permissions to the various collections for ITSI roles.
- Click Save.
This action updates KV store access permissions for the specific ITSI roles in `$SPLUNK_HOME/etc/apps/SA-ITOA/metadata/local.meta`.
### Set permissions to KV store collections from the command line
- Create a `local.meta` file in the `SA-ITOA/metadata/` directory.
CODECopy
cd $SPLUNK_HOME/etc/apps/SA-ITOA/metadata
cp default.meta local.meta
```
cd $SPLUNK_HOME/etc/apps/SA-ITOA/metadata
cp default.meta local.meta
```
- Edit `SA-ITOA/metadata/local.meta`.
- Set access for specific roles in `local.meta`. For example:
CODECopy
[collections/itsi_services]
access = read : [ itoa_admin, itoa_analyst, itoa_user ], write: [ itoa_admin ]
```
[collections/itsi_services]
access = read : [ itoa_admin, itoa_analyst, itoa_user ], write: [ itoa_admin ]
```

---
